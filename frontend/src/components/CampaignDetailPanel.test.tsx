import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignDetailPanel } from "./CampaignDetailPanel";
import { AppConfig, Campaign } from "../types/campaign";

const mockConfig: AppConfig = {
  allowedAssets: ["USDC"],
  sorobanRpcUrl: "https://soroban-testnet.stellar.org:443",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractAmountDecimals: 2,
  walletIntegrationReady: true,
};

const mockCampaign: Campaign = {
  id: "1",
  title: "Test Campaign",
  description: "A test campaign description that is long enough to look realistic.",
  creator: `G${"A".repeat(55)}`,
  assetCode: "USDC",
  targetAmount: 100,
  pledgedAmount: 0,
  deadline: Math.floor(Date.now() / 1000) + 7200,
  createdAt: Math.floor(Date.now() / 1000),
  pledges: [],
  progress: {
    status: "open",
    percentFunded: 0,
    remainingAmount: 100,
    pledgeCount: 0,
    hoursLeft: 2,
    canPledge: true,
    canClaim: false,
    canRefund: false,
  },
  metadata: {},
};

describe("CampaignDetailPanel", () => {
  it("shows empty state when no campaign is selected", () => {
    render(
      <CampaignDetailPanel
        campaign={null}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={async () => {}}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    expect(screen.getByText(/Pick a campaign/i)).toBeInTheDocument();
  });

  it("shows a connect button when no wallet is connected", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={async () => {}}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /connect freighter/i })).toBeInTheDocument();
  });

  it("calls onConnectWallet when the wallet button is clicked", async () => {
    const user = userEvent.setup();
    const onConnectWallet = vi.fn().mockResolvedValue(undefined);

    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={null}
        onConnectWallet={onConnectWallet}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /connect freighter/i }));
    expect(onConnectWallet).toHaveBeenCalled();
  });

  it("submits a pledge when a wallet is connected", async () => {
    const user = userEvent.setup();
    const onPledge = vi.fn().mockResolvedValue(undefined);

    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={`G${"B".repeat(55)}`}
        onConnectWallet={async () => {}}
        onPledge={onPledge}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    await user.clear(screen.getByDisplayValue("25"));
    await user.type(screen.getByRole("spinbutton"), "42");
    await user.click(screen.getByRole("button", { name: /sign pledge with freighter/i }));

    expect(onPledge).toHaveBeenCalledWith("1", 42);
  });

  it("shows an action error when provided", () => {
    render(
      <CampaignDetailPanel
        campaign={mockCampaign}
        appConfig={mockConfig}
        connectedWallet={`G${"B".repeat(55)}`}
        actionError={{ message: "Simulation failed", code: "SIMULATION_FAILED" }}
        onConnectWallet={async () => {}}
        onPledge={async () => {}}
        onClaim={async () => {}}
        onRefund={async () => {}}
      />,
    );

    expect(screen.getByText("Simulation failed")).toBeInTheDocument();
    expect(screen.getByText(/SIMULATION_FAILED/i)).toBeInTheDocument();
  });
});
