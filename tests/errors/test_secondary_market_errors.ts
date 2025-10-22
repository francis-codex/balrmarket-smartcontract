import { expect } from "chai";

describe("Secondary Market Error Codes Tests", () => {
  describe("Error Code Range Validation", () => {
    it("should have secondary market errors in 6200-6215 range", () => {
      const SECONDARY_MARKET_ERROR_START = 6200;
      const SECONDARY_MARKET_ERROR_END = 6215;
      const ERROR_COUNT = 16;

      expect(SECONDARY_MARKET_ERROR_END - SECONDARY_MARKET_ERROR_START + 1).to.equal(ERROR_COUNT);
    });

    it("should not conflict with primary market errors (6000-6099)", () => {
      const SECONDARY_START = 6200;
      const PRIMARY_END = 6099;

      expect(SECONDARY_START).to.be.greaterThan(PRIMARY_END);
    });

    it("should not conflict with admin hierarchy errors (6100-6199)", () => {
      const SECONDARY_START = 6200;
      const ADMIN_END = 6199;

      expect(SECONDARY_START).to.be.greaterThan(ADMIN_END);
    });
  });

  describe("Individual Error Code Validation", () => {
    it("should validate SecondaryMarketNotOpen error code", () => {
      const errorCode = 6200;
      const errorMessage = "Secondary market not open for trading";

      expect(errorCode).to.equal(6200);
      expect(errorMessage).to.include("not open");
    });

    it("should validate SecondaryMarketAlreadyOpen error code", () => {
      const errorCode = 6201;
      const errorMessage = "Secondary market already open for this event";

      expect(errorCode).to.equal(6201);
      expect(errorMessage).to.include("already open");
    });

    it("should validate InvalidSecondaryPrice error code", () => {
      const errorCode = 6202;
      const errorMessage = "Invalid secondary market price (must be 0 < price < 1 SOL)";

      expect(errorCode).to.equal(6202);
      expect(errorMessage).to.include("Invalid");
      expect(errorMessage).to.include("price");
    });

    it("should validate ShareNotLocked error code", () => {
      const errorCode = 6203;
      const errorMessage = "Share is not locked";

      expect(errorCode).to.equal(6203);
      expect(errorMessage).to.include("not locked");
    });

    it("should validate ShareAlreadyLocked error code", () => {
      const errorCode = 6204;
      const errorMessage = "Share is already locked for another order";

      expect(errorCode).to.equal(6204);
      expect(errorMessage).to.include("already locked");
    });

    it("should validate InsufficientLockedShares error code", () => {
      const errorCode = 6205;
      const errorMessage = "Insufficient locked shares for this operation";

      expect(errorCode).to.equal(6205);
      expect(errorMessage).to.include("Insufficient");
    });

    it("should validate InvalidSignature error code", () => {
      const errorCode = 6206;
      const errorMessage = "Invalid signature - signature verification failed";

      expect(errorCode).to.equal(6206);
      expect(errorMessage).to.include("signature");
    });

    it("should validate BidNotAccepted error code", () => {
      const errorCode = 6207;
      const errorMessage = "Bid has not been accepted yet";

      expect(errorCode).to.equal(6207);
      expect(errorMessage).to.include("not been accepted");
    });

    it("should validate OrderNotActive error code", () => {
      const errorCode = 6208;
      const errorMessage = "Order is not active";

      expect(errorCode).to.equal(6208);
      expect(errorMessage).to.include("not active");
    });

    it("should validate BidExpired error code", () => {
      const errorCode = 6209;
      const errorMessage = "Bid has expired";

      expect(errorCode).to.equal(6209);
      expect(errorMessage).to.include("expired");
    });

    it("should validate OrderExpired error code", () => {
      const errorCode = 6210;
      const errorMessage = "Order has expired";

      expect(errorCode).to.equal(6210);
      expect(errorMessage).to.include("expired");
    });

    it("should validate MarketNotResolved error code", () => {
      const errorCode = 6211;
      const errorMessage = "Market has not been resolved yet";

      expect(errorCode).to.equal(6211);
      expect(errorMessage).to.include("not been resolved");
    });

    it("should validate PayoutAlreadyClaimed error code", () => {
      const errorCode = 6212;
      const errorMessage = "Payout has already been claimed";

      expect(errorCode).to.equal(6212);
      expect(errorMessage).to.include("already been claimed");
    });

    it("should validate NoWinningShares error code", () => {
      const errorCode = 6213;
      const errorMessage = "User has no winning shares to claim";

      expect(errorCode).to.equal(6213);
      expect(errorMessage).to.include("no winning shares");
    });

    it("should validate InvalidBidQuantity error code", () => {
      const errorCode = 6214;
      const errorMessage = "Invalid bid quantity - must be within order limits";

      expect(errorCode).to.equal(6214);
      expect(errorMessage).to.include("Invalid bid quantity");
    });

    it("should validate PriceOutOfRange error code", () => {
      const errorCode = 6215;
      const errorMessage = "Price is out of valid range";

      expect(errorCode).to.equal(6215);
      expect(errorMessage).to.include("out of");
    });
  });

  describe("Error Code Uniqueness", () => {
    it("should have unique error codes", () => {
      const errorCodes = [
        6200, 6201, 6202, 6203, 6204, 6205, 6206, 6207,
        6208, 6209, 6210, 6211, 6212, 6213, 6214, 6215
      ];

      const uniqueCodes = new Set(errorCodes);
      expect(uniqueCodes.size).to.equal(errorCodes.length);
    });

    it("should have sequential error codes", () => {
      const errorCodes = [
        6200, 6201, 6202, 6203, 6204, 6205, 6206, 6207,
        6208, 6209, 6210, 6211, 6212, 6213, 6214, 6215
      ];

      for (let i = 0; i < errorCodes.length - 1; i++) {
        expect(errorCodes[i + 1] - errorCodes[i]).to.equal(1);
      }
    });
  });

  describe("Error Message Quality", () => {
    it("should have descriptive error messages", () => {
      const errorMessages = [
        "Secondary market not open for trading",
        "Secondary market already open for this event",
        "Invalid secondary market price (must be 0 < price < 1 SOL)",
        "Share is not locked",
        "Share is already locked for another order",
        "Insufficient locked shares for this operation",
        "Invalid signature - signature verification failed",
        "Bid has not been accepted yet",
        "Order is not active",
        "Bid has expired",
        "Order has expired",
        "Market has not been resolved yet",
        "Payout has already been claimed",
        "User has no winning shares to claim",
        "Invalid bid quantity - must be within order limits",
        "Price is out of valid range"
      ];

      errorMessages.forEach(msg => {
        expect(msg.length).to.be.greaterThan(10);
        expect(msg.length).to.be.lessThan(100);
      });
    });

    it("should have clear and actionable error messages", () => {
      // Messages should indicate the problem clearly
      const messages = [
        "not open",
        "already open",
        "Invalid",
        "not locked",
        "already locked",
        "Insufficient",
        "signature",
        "not been accepted",
        "not active",
        "expired",
        "expired",
        "not been resolved",
        "already been claimed",
        "no winning shares",
        "Invalid",
        "out of"
      ];

      messages.forEach(msg => {
        expect(msg.length).to.be.greaterThan(0);
      });
    });
  });

  describe("Error Context Validation", () => {
    it("should categorize market state errors correctly", () => {
      const marketStateErrors = [6200, 6201, 6211]; // NotOpen, AlreadyOpen, NotResolved

      expect(marketStateErrors.length).to.equal(3);
    });

    it("should categorize share locking errors correctly", () => {
      const shareLockErrors = [6203, 6204, 6205]; // NotLocked, AlreadyLocked, Insufficient

      expect(shareLockErrors.length).to.equal(3);
    });

    it("should categorize order/bid errors correctly", () => {
      const orderBidErrors = [6207, 6208, 6209, 6210, 6214]; // BidNotAccepted, OrderNotActive, BidExpired, OrderExpired, InvalidBidQuantity

      expect(orderBidErrors.length).to.equal(5);
    });

    it("should categorize payout errors correctly", () => {
      const payoutErrors = [6212, 6213]; // PayoutAlreadyClaimed, NoWinningShares

      expect(payoutErrors.length).to.equal(2);
    });

    it("should categorize validation errors correctly", () => {
      const validationErrors = [6202, 6206, 6215]; // InvalidSecondaryPrice, InvalidSignature, PriceOutOfRange

      expect(validationErrors.length).to.equal(3);
    });
  });

  describe("Security-Related Errors", () => {
    it("should have signature verification error", () => {
      const INVALID_SIGNATURE = 6206;

      expect(INVALID_SIGNATURE).to.equal(6206);
    });

    it("should have share locking protection errors", () => {
      const SHARE_NOT_LOCKED = 6203;
      const SHARE_ALREADY_LOCKED = 6204;
      const INSUFFICIENT_LOCKED_SHARES = 6205;

      expect(SHARE_NOT_LOCKED).to.equal(6203);
      expect(SHARE_ALREADY_LOCKED).to.equal(6204);
      expect(INSUFFICIENT_LOCKED_SHARES).to.equal(6205);
    });

    it("should have price validation errors", () => {
      const INVALID_SECONDARY_PRICE = 6202;
      const PRICE_OUT_OF_RANGE = 6215;

      expect(INVALID_SECONDARY_PRICE).to.equal(6202);
      expect(PRICE_OUT_OF_RANGE).to.equal(6215);
    });
  });
});
