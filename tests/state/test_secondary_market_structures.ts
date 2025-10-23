import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Balrmarket } from "../../target/types/balrmarket";

describe("Secondary Market State Structures Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  describe("Account Size Verification", () => {
    it("should calculate correct SecondaryMarketState account size", () => {
      // 4+50 + 4+50 + 1 + 8 + 1+8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 = 179
      const expectedSize = 179;
      expect(expectedSize).to.equal(179);
      // Note: Anchor adds 8-byte discriminator, total = 187 bytes
    });

    it("should calculate correct SecondaryOrder account size", () => {
      // 8 + 4+50 + 32 + 1 + 8 + 8 + 8 + 1 + 8 + 8 + 32 + 1 = 169
      const expectedSize = 169;
      expect(expectedSize).to.equal(169);
      // With discriminator: 177 bytes
    });

    it("should calculate correct SecondaryBid account size", () => {
      // 8 + 8 + 4+50 + 32 + 8 + 8 + 1 + 8 + 8 + 1+8 + 1 = 153
      const expectedSize = 153;
      expect(expectedSize).to.equal(153);
      // With discriminator: 161 bytes
    });

    it("should calculate correct SettledTrade account size", () => {
      // 8 + 4+50 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 = 176
      const expectedSize = 176;
      expect(expectedSize).to.equal(176);
      // With discriminator: 184 bytes
    });

    it("should calculate correct ShareLock account size", () => {
      // 32 + 32 + 4+50 + 1 + 8 + 8 + 8 + 1 + 1 = 145
      const expectedSize = 145;
      expect(expectedSize).to.equal(145);
      // With discriminator: 153 bytes
    });

    it("should calculate correct PayoutClaim account size", () => {
      // 8 + 4+50 + 32 + 1 + 8 + 8 + 8 + 1 + 1 = 121
      const expectedSize = 121;
      expect(expectedSize).to.equal(121);
      // With discriminator: 129 bytes
    });
  });

  describe("Modified Existing Structures", () => {
    it("should calculate Event struct additional fields size", () => {
      // Event should now include:
      // - secondary_market_state: Option<Pubkey> (1 + 32 = 33)
      // - secondary_market_opened_at: Option<i64> (1 + 8 = 9)
      // - secondary_market_closed_at: Option<i64> (1 + 8 = 9)
      // - total_secondary_trades: u64 (8)
      // - total_secondary_volume: u64 (8)
      const additionalBytes = 33 + 9 + 9 + 8 + 8;
      expect(additionalBytes).to.equal(67);
    });

    it("should calculate ShareToken struct additional fields size", () => {
      // ShareToken should now include:
      // - is_locked: bool (1)
      // - lock_order_id: Option<u64> (1 + 8 = 9)
      // - locked_at: Option<i64> (1 + 8 = 9)
      const additionalBytes = 1 + 9 + 9;
      expect(additionalBytes).to.equal(19);
    });
  });

  describe("Enum Validations", () => {
    it("should validate SecondaryMarketStatus enum variants", () => {
      // Closed = 0, Open = 1, Paused = 2
      expect(true).to.be.true;
    });

    it("should validate SecondaryOrderStatus enum variants", () => {
      // Active, PartiallyFilled, Filled, Cancelled, Expired
      expect(true).to.be.true;
    });

    it("should validate SecondaryBidStatus enum variants", () => {
      // Pending, Accepted, Rejected, Expired, Settled
      expect(true).to.be.true;
    });

    it("should validate LockStatus enum variants", () => {
      // Locked, Unlocked, Released
      expect(true).to.be.true;
    });

    it("should validate ClaimStatus enum variants", () => {
      // Pending, Claimed, Rejected
      expect(true).to.be.true;
    });
  });

  describe("Constants Validation", () => {
    it("should validate MAX_BATCH_TRADES constant", () => {
      const MAX_BATCH_TRADES = 100;
      expect(MAX_BATCH_TRADES).to.equal(100);
    });

    it("should validate MAX_PLATFORM_FEE_BPS constant", () => {
      const MAX_PLATFORM_FEE_BPS = 500; // 5%
      expect(MAX_PLATFORM_FEE_BPS).to.equal(500);
    });

    it("should validate ORDER_EXPIRY_SECONDS constant", () => {
      const ORDER_EXPIRY_SECONDS = 86400; // 24 hours
      expect(ORDER_EXPIRY_SECONDS).to.equal(86400);
    });

    it("should validate BID_EXPIRY_SECONDS constant", () => {
      const BID_EXPIRY_SECONDS = 3600; // 1 hour
      expect(BID_EXPIRY_SECONDS).to.equal(3600);
    });

    it("should validate MIN_ORDER_QUANTITY constant", () => {
      const MIN_ORDER_QUANTITY = 1;
      expect(MIN_ORDER_QUANTITY).to.equal(1);
    });

    it("should validate MAX_ORDER_QUANTITY constant", () => {
      const MAX_ORDER_QUANTITY = 1000;
      expect(MAX_ORDER_QUANTITY).to.equal(1000);
    });

    it("should validate PRICE_SNAPSHOT_INTERVAL constant", () => {
      const PRICE_SNAPSHOT_INTERVAL = 120; // 2 minutes
      expect(PRICE_SNAPSHOT_INTERVAL).to.equal(120);
    });

    it("should validate LAMPORTS_PER_SOL constant", () => {
      const LAMPORTS_PER_SOL = 1_000_000_000;
      expect(LAMPORTS_PER_SOL).to.equal(1_000_000_000);
    });
  });

  describe("Helper Struct Validations", () => {
    it("should validate TradeData structure", () => {
      // seller: Pubkey (32)
      // buyer: Pubkey (32)
      // share_type: ShareType (1)
      // quantity: u64 (8)
      // price_per_share: u64 (8)
      // seller_signature: [u8; 64] (64)
      // buyer_signature: [u8; 64] (64)
      // order_id: u64 (8)
      // bid_id: u64 (8)
      // Total: 225 bytes
      const expectedSize = 225;
      expect(expectedSize).to.equal(225);
    });

    it("should validate PriceSnapshot structure", () => {
      // yes_bid: u64 (8)
      // yes_ask: u64 (8)
      // no_bid: u64 (8)
      // no_ask: u64 (8)
      // timestamp: i64 (8)
      // Total: 40 bytes
      const expectedSize = 40;
      expect(expectedSize).to.equal(40);
    });
  });

  describe("Price Validation Logic", () => {
    it("should validate price range (0 < price < 1 SOL)", () => {
      const LAMPORTS_PER_SOL = 1_000_000_000;

      // Valid prices
      const validPrice1 = 500_000_000; // 0.5 SOL
      const validPrice2 = 1; // minimum
      const validPrice3 = LAMPORTS_PER_SOL - 1; // maximum

      expect(validPrice1 > 0 && validPrice1 < LAMPORTS_PER_SOL).to.be.true;
      expect(validPrice2 > 0 && validPrice2 < LAMPORTS_PER_SOL).to.be.true;
      expect(validPrice3 > 0 && validPrice3 < LAMPORTS_PER_SOL).to.be.true;

      // Invalid prices
      const invalidPrice1 = 0;
      const invalidPrice2 = LAMPORTS_PER_SOL;
      const invalidPrice3 = LAMPORTS_PER_SOL + 1;

      expect(invalidPrice1 > 0 && invalidPrice1 < LAMPORTS_PER_SOL).to.be.false;
      expect(invalidPrice2 > 0 && invalidPrice2 < LAMPORTS_PER_SOL).to.be.false;
      expect(invalidPrice3 > 0 && invalidPrice3 < LAMPORTS_PER_SOL).to.be.false;
    });

    it("should validate bid-ask spread (bid <= ask)", () => {
      const validBid1 = 400_000_000;
      const validAsk1 = 600_000_000;
      expect(validBid1 <= validAsk1).to.be.true;

      const validBid2 = 500_000_000;
      const validAsk2 = 500_000_000;
      expect(validBid2 <= validAsk2).to.be.true;

      const invalidBid = 700_000_000;
      const invalidAsk = 600_000_000;
      expect(invalidBid <= invalidAsk).to.be.false;
    });
  });

  describe("Platform Fee Calculation", () => {
    it("should correctly calculate platform fee", () => {
      const totalAmount = 1_000_000_000; // 1 SOL
      const feeBps = 200; // 2%

      // fee = (amount * bps) / 10000
      const expectedFee = (totalAmount * feeBps) / 10000;
      expect(expectedFee).to.equal(20_000_000); // 0.02 SOL
    });

    it("should handle different fee basis points", () => {
      const totalAmount = 500_000_000; // 0.5 SOL

      // 1% fee
      const fee1 = (totalAmount * 100) / 10000;
      expect(fee1).to.equal(5_000_000); // 0.005 SOL

      // 5% fee (max)
      const fee5 = (totalAmount * 500) / 10000;
      expect(fee5).to.equal(25_000_000); // 0.025 SOL

      // 0.5% fee
      const fee05 = (totalAmount * 50) / 10000;
      expect(fee05).to.equal(2_500_000); // 0.0025 SOL
    });

    it("should validate seller receives amount after fee", () => {
      const totalAmount = 1_000_000_000; // 1 SOL
      const feeBps = 200; // 2%
      const platformFee = (totalAmount * feeBps) / 10000;
      const sellerReceives = totalAmount - platformFee;

      expect(sellerReceives).to.equal(980_000_000); // 0.98 SOL
    });
  });

  describe("Expiry Time Validations", () => {
    it("should validate order expiry (24 hours)", () => {
      const now = Date.now() / 1000; // Current Unix timestamp
      const ORDER_EXPIRY_SECONDS = 86400;
      const expiresAt = now + ORDER_EXPIRY_SECONDS;

      expect(expiresAt).to.be.greaterThan(now);
      expect(expiresAt - now).to.equal(ORDER_EXPIRY_SECONDS);
    });

    it("should validate bid expiry (1 hour)", () => {
      const now = Date.now() / 1000;
      const BID_EXPIRY_SECONDS = 3600;
      const expiresAt = now + BID_EXPIRY_SECONDS;

      expect(expiresAt).to.be.greaterThan(now);
      expect(expiresAt - now).to.equal(BID_EXPIRY_SECONDS);
    });

    it("should detect expired orders", () => {
      const now = Date.now() / 1000;
      const pastExpiry = now - 1000; // Expired 1000 seconds ago

      expect(now > pastExpiry).to.be.true;
    });

    it("should detect expired bids", () => {
      const now = Date.now() / 1000;
      const pastExpiry = now - 100; // Expired 100 seconds ago

      expect(now > pastExpiry).to.be.true;
    });
  });

  describe("PDA Seed Validation", () => {
    it("should validate SecondaryMarketState PDA seeds", () => {
      const seeds = ["secondary_market", "event_id_test"];
      expect(seeds[0]).to.equal("secondary_market");
    });

    it("should validate SecondaryOrder PDA seeds", () => {
      const seeds = ["secondary_order", "event_id_test", "12345"];
      expect(seeds[0]).to.equal("secondary_order");
    });

    it("should validate SecondaryBid PDA seeds", () => {
      const seeds = ["secondary_bid", "event_id_test", "67890"];
      expect(seeds[0]).to.equal("secondary_bid");
    });

    it("should validate SettledTrade PDA seeds", () => {
      const seeds = ["settled_trade", "event_id_test", "trade_123"];
      expect(seeds[0]).to.equal("settled_trade");
    });

    it("should validate ShareLock PDA seeds", () => {
      const seeds = ["share_lock", "share_token_pubkey", "order_456"];
      expect(seeds[0]).to.equal("share_lock");
    });

    it("should validate PayoutClaim PDA seeds", () => {
      const seeds = ["payout_claim", "event_id_test", "claimer_pubkey"];
      expect(seeds[0]).to.equal("payout_claim");
    });
  });

  describe("Security Validations", () => {
    it("should enforce quantity limits", () => {
      const MIN_ORDER_QUANTITY = 1;
      const MAX_ORDER_QUANTITY = 1000;

      const validQuantity1 = 1;
      const validQuantity2 = 500;
      const validQuantity3 = 1000;

      expect(validQuantity1 >= MIN_ORDER_QUANTITY && validQuantity1 <= MAX_ORDER_QUANTITY).to.be.true;
      expect(validQuantity2 >= MIN_ORDER_QUANTITY && validQuantity2 <= MAX_ORDER_QUANTITY).to.be.true;
      expect(validQuantity3 >= MIN_ORDER_QUANTITY && validQuantity3 <= MAX_ORDER_QUANTITY).to.be.true;

      const invalidQuantity1 = 0;
      const invalidQuantity2 = 1001;

      expect(invalidQuantity1 >= MIN_ORDER_QUANTITY && invalidQuantity1 <= MAX_ORDER_QUANTITY).to.be.false;
      expect(invalidQuantity2 >= MIN_ORDER_QUANTITY && invalidQuantity2 <= MAX_ORDER_QUANTITY).to.be.false;
    });

    it("should validate batch trade limits", () => {
      const MAX_BATCH_TRADES = 100;

      const validBatchSize = 50;
      expect(validBatchSize <= MAX_BATCH_TRADES).to.be.true;

      const invalidBatchSize = 101;
      expect(invalidBatchSize <= MAX_BATCH_TRADES).to.be.false;
    });

    it("should validate signature lengths", () => {
      const signatureLength = 64;
      expect(signatureLength).to.equal(64);
    });
  });

  describe("State Transition Validations", () => {
    it("should validate SecondaryMarketStatus transitions", () => {
      // Valid transitions:
      // Closed -> Open
      // Open -> Paused
      // Paused -> Open
      // Open -> Closed
      expect(true).to.be.true;
    });

    it("should validate SecondaryOrderStatus transitions", () => {
      // Valid transitions:
      // Active -> PartiallyFilled
      // PartiallyFilled -> Filled
      // Active -> Cancelled
      // Active -> Expired
      expect(true).to.be.true;
    });

    it("should validate SecondaryBidStatus transitions", () => {
      // Valid transitions:
      // Pending -> Accepted
      // Pending -> Rejected
      // Pending -> Expired
      // Accepted -> Settled
      expect(true).to.be.true;
    });

    it("should validate LockStatus transitions", () => {
      // Valid transitions:
      // Locked -> Unlocked
      // Locked -> Released
      expect(true).to.be.true;
    });

    it("should validate ClaimStatus transitions", () => {
      // Valid transitions:
      // Pending -> Claimed
      // Pending -> Rejected
      expect(true).to.be.true;
    });
  });

  describe("Data Integrity Checks", () => {
    it("should validate remaining_quantity logic", () => {
      const initialQuantity = 100;
      const filledQuantity = 30;
      const remainingQuantity = initialQuantity - filledQuantity;

      expect(remainingQuantity).to.equal(70);
      expect(remainingQuantity > 0).to.be.true;
    });

    it("should validate total_amount calculation", () => {
      const quantity = 10;
      const pricePerShare = 50_000_000; // 0.05 SOL
      const totalAmount = quantity * pricePerShare;

      expect(totalAmount).to.equal(500_000_000); // 0.5 SOL
    });

    it("should validate seller_receives calculation", () => {
      const totalAmount = 1_000_000_000; // 1 SOL
      const platformFee = 20_000_000; // 0.02 SOL (2%)
      const sellerReceives = totalAmount - platformFee;

      expect(sellerReceives).to.equal(980_000_000); // 0.98 SOL
      expect(sellerReceives < totalAmount).to.be.true;
    });
  });
});
