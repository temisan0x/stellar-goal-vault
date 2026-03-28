import { useEffect, useMemo, useState } from "react";
import { CampaignDetailPanel } from "./components/CampaignDetailPanel";
import { CampaignsTable } from "./components/CampaignsTable";
import { CampaignTimeline } from "./components/CampaignTimeline";
import { CreateCampaignForm } from "./components/CreateCampaignForm";
import { IssueBacklog } from "./components/IssueBacklog";
import {
  claimCampaign,
  createCampaign,
  getAppConfig,
  getCampaign,
  getCampaignHistory,
  listCampaigns,
  listOpenIssues,
  reconcilePledge,
  refundCampaign,
} from "./services/api";
import { connectFreighterWallet, submitFreighterPledge } from "./services/freighter";
import { ApiError, AppConfig, Campaign, CampaignEvent, OpenIssue } from "./types/campaign";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getCampaignIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("campaign");
}

function setCampaignIdInUrl(campaignId: string | null): void {
  const url = new URL(window.location.href);
  if (campaignId) {
    url.searchParams.set("campaign", campaignId);
  } else {
    url.searchParams.delete("campaign");
  }
  window.history.replaceState(null, "", url.toString());
}

function toApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as Error & { code?: string }).code,
      details: (error as Error & { details?: ApiError["details"] }).details,
      requestId: (error as Error & { requestId?: string }).requestId,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: "An unexpected error occurred." };
}

function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [history, setHistory] = useState<CampaignEvent[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [isCampaignsLoading, setIsCampaignsLoading] = useState(false);
  const [isSelectedLoading, setIsSelectedLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<Campaign | null>(null);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingPledgeCampaignId, setPendingPledgeCampaignId] = useState<string | null>(null);
  const [invalidUrlCampaignId, setInvalidUrlCampaignId] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  useEffect(() => {
    setCampaignIdInUrl(selectedCampaignId);
  }, [selectedCampaignId]);

  async function refreshCampaigns(nextSelectedId?: string | null) {
    const startedAt = Date.now();
    setIsCampaignsLoading(true);
    try {
      const data = await listCampaigns();
      setCampaigns(data);

      const candidateId =
        nextSelectedId ?? selectedCampaignId ?? (data.length > 0 ? data[0].id : null);
      const exists = data.some((campaign) => campaign.id === candidateId);
      setSelectedCampaignId(exists ? candidateId : data[0]?.id ?? null);
    } finally {
      const elapsed = Date.now() - startedAt;
      const minMs = 250;
      if (elapsed < minMs) {
        await delay(minMs - elapsed);
      }
      setIsCampaignsLoading(false);
    }
  }

  async function refreshHistory(campaignId: string | null) {
    if (!campaignId) {
      setHistory([]);
      return;
    }

    const nextHistory = await getCampaignHistory(campaignId);
    setHistory(nextHistory);
  }

  async function refreshSelectedCampaign(campaignId: string | null) {
    if (!campaignId) {
      setSelectedCampaignDetails(null);
      return;
    }

    const startedAt = Date.now();
    setIsSelectedLoading(true);
    try {
      const campaign = await getCampaign(campaignId);
      setSelectedCampaignDetails(campaign);
    } finally {
      const elapsed = Date.now() - startedAt;
      const minMs = 150;
      if (elapsed < minMs) {
        await delay(minMs - elapsed);
      }
      setIsSelectedLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setInitialLoad(true);

      try {
        const [campaignList, openIssues, config] = await Promise.all([
          listCampaigns(),
          listOpenIssues(),
          getAppConfig(),
        ]);

        if (cancelled) {
          return;
        }

        setCampaigns(campaignList);
        setIssues(openIssues);
        setAppConfig(config);

        const urlCampaignId = getCampaignIdFromUrl();
        const defaultCampaignId = campaignList[0]?.id ?? null;
        const nextSelectedId =
          urlCampaignId && campaignList.some((campaign) => campaign.id === urlCampaignId)
            ? urlCampaignId
            : defaultCampaignId;

        if (urlCampaignId && !campaignList.some((campaign) => campaign.id === urlCampaignId)) {
          setInvalidUrlCampaignId(urlCampaignId);
        }

        setSelectedCampaignId(nextSelectedId);
      } catch (error) {
        if (!cancelled) {
          setActionError(toApiError(error));
        }
      } finally {
        if (!cancelled) {
          setInitialLoad(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialLoad) {
      return;
    }

    setSelectedCampaignDetails(null);
    void Promise.all([
      refreshHistory(selectedCampaignId).catch((error) => setActionError(toApiError(error))),
      refreshSelectedCampaign(selectedCampaignId).catch((error) =>
        setActionError(toApiError(error)),
      ),
    ]);
  }, [initialLoad, selectedCampaignId]);

  const selectedCampaign = useMemo(() => {
    const baseCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
    if (!baseCampaign) {
      return null;
    }
    if (selectedCampaignDetails?.id !== baseCampaign.id) {
      return baseCampaign;
    }
    return { ...baseCampaign, pledges: selectedCampaignDetails.pledges };
  }, [campaigns, selectedCampaignDetails, selectedCampaignId]);

  const metrics = useMemo(() => {
    const open = campaigns.filter((campaign) => campaign.progress.status === "open").length;
    const funded = campaigns.filter((campaign) => campaign.progress.status === "funded").length;
    const pledged = campaigns.reduce((sum, campaign) => sum + campaign.pledgedAmount, 0);

    return {
      total: campaigns.length,
      open,
      funded,
      pledged: Number(pledged.toFixed(2)),
    };
  }, [campaigns]);

  async function handleCreate(payload: Parameters<typeof createCampaign>[0]) {
    setCreateError(null);
    setActionError(null);
    setActionMessage(null);

    try {
      const campaign = await createCampaign(payload);
      await refreshCampaigns(campaign.id);
      await Promise.all([
        refreshHistory(campaign.id),
        refreshSelectedCampaign(campaign.id),
      ]);
      setActionMessage(`Campaign #${campaign.id} is live and ready for pledges.`);
    } catch (error) {
      setCreateError(toApiError(error));
    }
  }

  async function handleConnectWallet() {
    if (!appConfig) {
      setActionError({ message: "The app configuration is still loading." });
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsConnectingWallet(true);

    try {
      const wallet = await connectFreighterWallet(appConfig.networkPassphrase);
      setConnectedWallet(wallet.publicKey);
      setActionMessage(`Connected wallet ${wallet.publicKey}.`);
    } catch (error) {
      setActionError(toApiError(error));
    } finally {
      setIsConnectingWallet(false);
    }
  }

  async function handlePledge(campaignId: string, amount: number) {
    if (!appConfig) {
      setActionError({ message: "The app configuration is still loading." });
      return;
    }

    if (!connectedWallet) {
      setActionError({
        message: "Connect Freighter before submitting an on-chain pledge.",
        code: "WALLET_REQUIRED",
      });
      return;
    }

    setActionError(null);
    setActionMessage("Simulating pledge transaction...");
    setPendingPledgeCampaignId(campaignId);

    try {
      const transactionResult = await submitFreighterPledge({
        campaignId,
        contributor: connectedWallet,
        amount,
        config: appConfig,
      });

      setActionMessage(
        `Transaction confirmed on-chain. Reconciling local campaign state for ${transactionResult.transactionHash}...`,
      );

      await reconcilePledge(campaignId, {
        contributor: connectedWallet,
        amount,
        transactionHash: transactionResult.transactionHash,
        confirmedAt: transactionResult.confirmedAt,
      });

      await refreshCampaigns(campaignId);
      await Promise.all([
        refreshHistory(campaignId),
        refreshSelectedCampaign(campaignId),
      ]);

      setActionMessage(
        `Pledge confirmed. Tx hash: ${transactionResult.transactionHash}`,
      );
    } catch (error) {
      setActionError(toApiError(error));
      setActionMessage(null);
    } finally {
      setPendingPledgeCampaignId(null);
    }
  }

  async function handleClaim(campaign: Campaign) {
    setActionError(null);
    setActionMessage(null);
    try {
      await claimCampaign(campaign.id, campaign.creator);
      await refreshCampaigns(campaign.id);
      await Promise.all([
        refreshHistory(campaign.id),
        refreshSelectedCampaign(campaign.id),
      ]);
      setActionMessage("Campaign claimed successfully.");
    } catch (error) {
      setActionError(toApiError(error));
    }
  }

  async function handleRefund(campaignId: string, contributor: string) {
    setActionError(null);
    setActionMessage(null);
    try {
      await refundCampaign(campaignId, contributor);
      await refreshCampaigns(campaignId);
      await Promise.all([
        refreshHistory(campaignId),
        refreshSelectedCampaign(campaignId),
      ]);
      setActionMessage("Refund recorded for the selected contributor.");
    } catch (error) {
      setActionError(toApiError(error));
    }
  }

  function handleSelect(campaignId: string) {
    setInvalidUrlCampaignId(null);
    setSelectedCampaignId(campaignId);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Soroban crowdfunding MVP</p>
        <h1>Stellar Goal Vault</h1>
        <p className="hero-copy">
          Create funding goals, connect Freighter, and reconcile real Soroban pledge
          transactions back into the local campaign view.
        </p>
      </header>

      {invalidUrlCampaignId ? (
        <div className="form-error" style={{ marginBottom: 24 }}>
          <p>
            Campaign #{invalidUrlCampaignId} was not found, so the dashboard selected the first
            available campaign instead.
          </p>
        </div>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span>Total campaigns</span>
          <strong>{metrics.total}</strong>
        </article>
        <article className="metric-card">
          <span>Open campaigns</span>
          <strong>{metrics.open}</strong>
        </article>
        <article className="metric-card">
          <span>Funded campaigns</span>
          <strong>{metrics.funded}</strong>
        </article>
        <article className="metric-card">
          <span>Total pledged</span>
          <strong>{metrics.pledged}</strong>
        </article>
      </section>

      <section className="layout-grid animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <CreateCampaignForm
          onCreate={handleCreate}
          apiError={createError}
          allowedAssets={appConfig?.allowedAssets ?? []}
        />
        <CampaignDetailPanel
          campaign={selectedCampaign}
          appConfig={appConfig}
          connectedWallet={connectedWallet}
          isConnectingWallet={isConnectingWallet}
          actionError={actionError}
          actionMessage={actionMessage}
          isPledgePending={pendingPledgeCampaignId === selectedCampaignId}
          isLoading={isSelectedLoading || initialLoad}
          onConnectWallet={handleConnectWallet}
          onPledge={handlePledge}
          onClaim={handleClaim}
          onRefund={handleRefund}
        />
      </section>

      <section className="layout-grid animate-fade-in" style={{ animationDelay: "0.35s" }}>
        <CampaignsTable
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          onSelect={handleSelect}
          isLoading={isCampaignsLoading || initialLoad}
        />
        <CampaignTimeline history={history} isLoading={isSelectedLoading || initialLoad} />
      </section>

      <section className="layout-grid animate-fade-in" style={{ animationDelay: "0.45s" }}>
        <IssueBacklog issues={issues} isLoading={initialLoad} />
      </section>
    </div>
  );
}

export default App;
