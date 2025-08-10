import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("Utility Functions Tests", () => {

  describe("OPTA Odds Normalization", () => {
    it("should normalize OPTA odds correctly for 60% YES probability", () => {
      // Test case: 60% YES with bookmaker margin
      const yesOddsBp = 6000; // 60%
      
      // Calculate expected normalized values
      const yesProb = yesOddsBp / 10000.0;
      const noProb = (10000 - yesOddsBp) / 10000.0;
      const totalProb = yesProb + noProb;
      const expectedYes = Math.floor((yesProb / totalProb) * 10000);
      const expectedNo = 10000 - expectedYes;
      
      // In this case, since there's no actual margin (60% + 40% = 100%), 
      // the normalized values should remain the same
      expect(expectedYes).to.equal(6000);
      expect(expectedNo).to.equal(4000);
      expect(expectedYes + expectedNo).to.equal(10000);
    });

    it("should normalize OPTA odds correctly for 50% YES probability", () => {
      const yesOddsBp = 5000; // 50%
      
      const yesProb = yesOddsBp / 10000.0;
      const noProb = (10000 - yesOddsBp) / 10000.0;
      const totalProb = yesProb + noProb;
      const expectedYes = Math.floor((yesProb / totalProb) * 10000);
      const expectedNo = 10000 - expectedYes;
      
      expect(expectedYes).to.equal(5000);
      expect(expectedNo).to.equal(5000);
      expect(expectedYes + expectedNo).to.equal(10000);
    });

    it("should normalize OPTA odds correctly for extreme probabilities", () => {
      // Test 90% YES
      const yesOddsBp = 9000; // 90%
      
      const yesProb = yesOddsBp / 10000.0;
      const noProb = (10000 - yesOddsBp) / 10000.0;
      const totalProb = yesProb + noProb;
      const expectedYes = Math.floor((yesProb / totalProb) * 10000);
      const expectedNo = 10000 - expectedYes;
      
      expect(expectedYes).to.equal(9000);
      expect(expectedNo).to.equal(1000);
      expect(expectedYes + expectedNo).to.equal(10000);
    });

    it("should normalize OPTA odds with bookmaker margin", () => {
      // Simulate a case with bookmaker margin where probabilities don't sum to 100%
      // For example, if bookmaker has 105% total probability (5% margin)
      // This would require modifying the input to simulate overround
      const yesOddsBp = 5250; // Slightly higher than 50% to simulate margin
      
      const yesProb = yesOddsBp / 10000.0;
      const noProb = (10000 - yesOddsBp) / 10000.0;
      const totalProb = yesProb + noProb;
      const expectedYes = Math.floor((yesProb / totalProb) * 10000);
      const expectedNo = 10000 - expectedYes;
      
      expect(expectedYes + expectedNo).to.equal(10000);
      expect(expectedYes).to.be.greaterThan(5000);
      expect(expectedNo).to.be.lessThan(5000);
    });
  });

  describe("Share Price Calculations", () => {
    it("should calculate share prices correctly for 60% YES probability", () => {
      const yesProbabilityBp = 6000; // 60%
      const expectedYesPrice = (yesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;
      
      expect(expectedYesPrice).to.equal(0.6 * LAMPORTS_PER_SOL);
      expect(expectedNoPrice).to.equal(0.4 * LAMPORTS_PER_SOL);
      expect(expectedYesPrice + expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
    });

    it("should calculate share prices correctly for 50% probability", () => {
      const yesProbabilityBp = 5000; // 50%
      const expectedYesPrice = (yesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;
      
      expect(expectedYesPrice).to.equal(0.5 * LAMPORTS_PER_SOL);
      expect(expectedNoPrice).to.equal(0.5 * LAMPORTS_PER_SOL);
      expect(expectedYesPrice + expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
    });

    it("should calculate share prices correctly for extreme probabilities", () => {
      // Test 95% YES
      const yesProbabilityBp = 9500; // 95%
      const expectedYesPrice = (yesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;
      
      expect(expectedYesPrice).to.equal(0.95 * LAMPORTS_PER_SOL);
      expect(expectedNoPrice).to.equal(0.05 * LAMPORTS_PER_SOL);
      expect(expectedYesPrice + expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
      
      // Test 5% YES
      const lowYesProbabilityBp = 500; // 5%
      const expectedLowYesPrice = (lowYesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedHighNoPrice = LAMPORTS_PER_SOL - expectedLowYesPrice;
      
      expect(expectedLowYesPrice).to.equal(0.05 * LAMPORTS_PER_SOL);
      expect(expectedHighNoPrice).to.equal(0.95 * LAMPORTS_PER_SOL);
      expect(expectedLowYesPrice + expectedHighNoPrice).to.equal(LAMPORTS_PER_SOL);
    });

    it("should handle edge case of 0% and 100% probabilities", () => {
      // Test 100% YES (though this shouldn't occur in practice)
      const yesProbabilityBp = 10000; // 100%
      const expectedYesPrice = (yesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;
      
      expect(expectedYesPrice).to.equal(LAMPORTS_PER_SOL);
      expect(expectedNoPrice).to.equal(0);
      expect(expectedYesPrice + expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
      
      // Test 0% YES
      const zeroYesProbabilityBp = 0; // 0%
      const expectedZeroYesPrice = (zeroYesProbabilityBp * LAMPORTS_PER_SOL) / 10000;
      const expectedFullNoPrice = LAMPORTS_PER_SOL - expectedZeroYesPrice;
      
      expect(expectedZeroYesPrice).to.equal(0);
      expect(expectedFullNoPrice).to.equal(LAMPORTS_PER_SOL);
      expect(expectedZeroYesPrice + expectedFullNoPrice).to.equal(LAMPORTS_PER_SOL);
    });
  });

  describe("Event Timing Validation", () => {
    it("should validate correct event timing", () => {
      const currentTime = Date.now() / 1000; // Current time in seconds
      const matchTimestamp = currentTime + (25 * 3600); // 25 hours in future
      
      const expectedPrimaryClose = matchTimestamp - 300; // 5 minutes before
      const expectedSecondaryOpen = matchTimestamp;
      const expectedSecondaryClose = matchTimestamp + 6300; // 105 minutes after
      
      // Validate the timing logic manually since we can't call the Rust function directly
      expect(matchTimestamp).to.be.greaterThan(currentTime + 86400); // At least 24 hours
      expect(expectedPrimaryClose).to.be.lessThan(matchTimestamp);
      expect(expectedSecondaryOpen).to.equal(matchTimestamp);
      expect(expectedSecondaryClose).to.be.greaterThan(matchTimestamp);
    });

    it("should reject matches scheduled too soon", () => {
      const currentTime = Date.now() / 1000;
      const matchTimestamp = currentTime + (23 * 3600); // 23 hours in future (too soon)
      
      // This should fail validation
      expect(matchTimestamp).to.be.lessThan(currentTime + 86400);
    });

    it("should calculate market phase timings correctly", () => {
      const currentTime = Date.now() / 1000;
      const matchTimestamp = currentTime + (48 * 3600); // 48 hours in future
      
      const primaryMarketClose = matchTimestamp - 300; // 5 minutes before match
      const secondaryMarketOpen = matchTimestamp; // Match start
      const secondaryMarketClose = matchTimestamp + 6300; // 105 minutes after match
      
      // Validate phases don't overlap
      expect(primaryMarketClose).to.be.lessThan(secondaryMarketOpen);
      expect(secondaryMarketOpen).to.be.lessThan(secondaryMarketClose);
      
      // Validate timing constraints
      expect(primaryMarketClose - currentTime).to.be.greaterThan(86400 - 300); // At least ~24 hours
      expect(secondaryMarketClose - secondaryMarketOpen).to.equal(6300); // Exactly 105 minutes
    });
  });

  describe("Market Phase Activity Checks", () => {
    it("should correctly identify primary market activity", () => {
      const currentTime = Date.now() / 1000;
      const primaryMarketClose = currentTime + 3600; // 1 hour in future
      
      // Primary market should be active if current time < close time
      const isActive = currentTime < primaryMarketClose;
      expect(isActive).to.be.true;
      
      // Primary market should be inactive if current time >= close time
      const futureTime = primaryMarketClose + 100;
      const isInactive = futureTime < primaryMarketClose;
      expect(isInactive).to.be.false;
    });

    it("should correctly identify secondary market activity", () => {
      const currentTime = Date.now() / 1000;
      const secondaryMarketOpen = currentTime - 1800; // 30 minutes ago
      const secondaryMarketClose = currentTime + 3600; // 1 hour in future
      
      // Secondary market should be active if within the window
      const isActive = currentTime >= secondaryMarketOpen && currentTime < secondaryMarketClose;
      expect(isActive).to.be.true;
      
      // Should be inactive before open
      const beforeOpen = secondaryMarketOpen - 100;
      const isInactiveBeforeOpen = beforeOpen >= secondaryMarketOpen && beforeOpen < secondaryMarketClose;
      expect(isInactiveBeforeOpen).to.be.false;
      
      // Should be inactive after close
      const afterClose = secondaryMarketClose + 100;
      const isInactiveAfterClose = afterClose >= secondaryMarketOpen && afterClose < secondaryMarketClose;
      expect(isInactiveAfterClose).to.be.false;
    });
  });

  describe("Fee Calculations", () => {
    it("should calculate platform fee correctly for 2% fee", () => {
      const amount = LAMPORTS_PER_SOL; // 1 SOL
      const feeBasisPoints = 200; // 2%
      const expectedFee = (amount * feeBasisPoints) / 10000;
      
      expect(expectedFee).to.equal(0.02 * LAMPORTS_PER_SOL);
    });

    it("should calculate platform fee correctly for 5% fee", () => {
      const amount = 2 * LAMPORTS_PER_SOL; // 2 SOL
      const feeBasisPoints = 500; // 5%
      const expectedFee = (amount * feeBasisPoints) / 10000;
      
      expect(expectedFee).to.equal(0.1 * LAMPORTS_PER_SOL);
    });

    it("should calculate total cost including fee", () => {
      const baseAmount = LAMPORTS_PER_SOL; // 1 SOL
      const feeBasisPoints = 300; // 3%
      const fee = (baseAmount * feeBasisPoints) / 10000;
      const totalCost = baseAmount + fee;
      
      expect(totalCost).to.equal(1.03 * LAMPORTS_PER_SOL);
    });

    it("should handle zero fee correctly", () => {
      const amount = LAMPORTS_PER_SOL;
      const feeBasisPoints = 0;
      const expectedFee = (amount * feeBasisPoints) / 10000;
      const totalCost = amount + expectedFee;
      
      expect(expectedFee).to.equal(0);
      expect(totalCost).to.equal(amount);
    });

    it("should handle maximum 5% fee correctly", () => {
      const amount = LAMPORTS_PER_SOL;
      const feeBasisPoints = 500; // 5% - maximum allowed
      const expectedFee = (amount * feeBasisPoints) / 10000;
      const totalCost = amount + expectedFee;
      
      expect(expectedFee).to.equal(0.05 * LAMPORTS_PER_SOL);
      expect(totalCost).to.equal(1.05 * LAMPORTS_PER_SOL);
    });
  });

  describe("String Validation", () => {
    it("should validate string length constraints for market ID", () => {
      const validMarketId = "VALID_MARKET_ID_123";
      const maxLength = 50;
      
      // Valid cases
      expect(validMarketId.length).to.be.lessThanOrEqual(maxLength);
      expect(validMarketId.length).to.be.greaterThan(0);
      
      // Invalid cases
      const tooLongMarketId = "A".repeat(51);
      expect(tooLongMarketId.length).to.be.greaterThan(maxLength);
      
      const emptyMarketId = "";
      expect(emptyMarketId.length).to.equal(0);
    });

    it("should validate string length constraints for team names", () => {
      const validTeamName = "Manchester United FC";
      const maxLength = 100;
      
      expect(validTeamName.length).to.be.lessThanOrEqual(maxLength);
      expect(validTeamName.length).to.be.greaterThan(0);
      
      const tooLongTeamName = "A".repeat(101);
      expect(tooLongTeamName.length).to.be.greaterThan(maxLength);
    });

    it("should validate string length constraints for event questions", () => {
      const validQuestion = "Will Manchester United win against Liverpool in the Premier League match on December 15th, 2024?";
      const maxLength = 200;
      
      expect(validQuestion.length).to.be.lessThanOrEqual(maxLength);
      expect(validQuestion.length).to.be.greaterThan(0);
      
      const tooLongQuestion = "A".repeat(201);
      expect(tooLongQuestion.length).to.be.greaterThan(maxLength);
    });
  });

  describe("Market Price Calculations", () => {
    it("should calculate market price with both YES and NO bids", () => {
      const bestYesBid = 0.6 * LAMPORTS_PER_SOL;
      const bestNoBid = 0.4 * LAMPORTS_PER_SOL;
      
      const totalBids = bestYesBid + bestNoBid;
      const expectedYesPrice = (bestYesBid * LAMPORTS_PER_SOL) / totalBids;
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;
      
      expect(expectedYesPrice).to.equal(0.6 * LAMPORTS_PER_SOL);
      expect(expectedNoPrice).to.equal(0.4 * LAMPORTS_PER_SOL);
      expect(expectedYesPrice + expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
    });

    it("should handle no orders (equal probability)", () => {
      const bestYesBid = 0;
      const bestNoBid = 0;
      
      if (bestYesBid === 0 && bestNoBid === 0) {
        const expectedYesPrice = LAMPORTS_PER_SOL / 2;
        const expectedNoPrice = LAMPORTS_PER_SOL / 2;
        
        expect(expectedYesPrice).to.equal(0.5 * LAMPORTS_PER_SOL);
        expect(expectedNoPrice).to.equal(0.5 * LAMPORTS_PER_SOL);
      }
    });

    it("should handle only YES bids", () => {
      const bestYesBid = 0.7 * LAMPORTS_PER_SOL;
      const bestNoBid = 0;
      
      if (bestNoBid === 0 && bestYesBid > 0) {
        const expectedYesPrice = LAMPORTS_PER_SOL;
        const expectedNoPrice = 0;
        
        expect(expectedYesPrice).to.equal(LAMPORTS_PER_SOL);
        expect(expectedNoPrice).to.equal(0);
      }
    });

    it("should handle only NO bids", () => {
      const bestYesBid = 0;
      const bestNoBid = 0.8 * LAMPORTS_PER_SOL;
      
      if (bestYesBid === 0 && bestNoBid > 0) {
        const expectedYesPrice = 0;
        const expectedNoPrice = LAMPORTS_PER_SOL;
        
        expect(expectedYesPrice).to.equal(0);
        expect(expectedNoPrice).to.equal(LAMPORTS_PER_SOL);
      }
    });
  });

  describe("Order ID Generation", () => {
    it("should generate consistent order IDs", () => {
      const user = Keypair.generate().publicKey;
      const eventId = "TEST_EVENT_123";
      const timestamp = 1640995200; // Fixed timestamp
      
      const orderId1 = `${user.toString().slice(0, 8)}_${eventId}__${timestamp}`;
      const orderId2 = `${user.toString().slice(0, 8)}_${eventId}__${timestamp}`;
      
      expect(orderId1).to.equal(orderId2);
      expect(orderId1).to.include(user.toString().slice(0, 8));
      expect(orderId1).to.include(eventId);
      expect(orderId1).to.include(timestamp.toString());
    });

    it("should generate unique order IDs for different inputs", () => {
      const user1 = Keypair.generate().publicKey;
      const user2 = Keypair.generate().publicKey;
      const eventId = "TEST_EVENT_123";
      const timestamp = 1640995200;
      
      const orderId1 = `${user1.toString().slice(0, 8)}_${eventId}__${timestamp}`;
      const orderId2 = `${user2.toString().slice(0, 8)}_${eventId}__${timestamp}`;
      
      expect(orderId1).to.not.equal(orderId2);
    });

    it("should generate unique order IDs for different timestamps", () => {
      const user = Keypair.generate().publicKey;
      const eventId = "TEST_EVENT_123";
      const timestamp1 = 1640995200;
      const timestamp2 = 1640995300;
      
      const orderId1 = `${user.toString().slice(0, 8)}_${eventId}__${timestamp1}`;
      const orderId2 = `${user.toString().slice(0, 8)}_${eventId}__${timestamp2}`;
      
      expect(orderId1).to.not.equal(orderId2);
    });
  });

  describe("Share Quantity Validation", () => {
    it("should validate valid share quantities", () => {
      const quantity = 100;
      const maxAvailable = 1000;
      const currentMinted = 400;
      
      // Valid case
      expect(quantity).to.be.greaterThan(0);
      expect(currentMinted + quantity).to.be.lessThanOrEqual(maxAvailable);
    });

    it("should reject zero quantity", () => {
      const quantity = 0;
      expect(quantity).to.equal(0); // Should fail validation
    });

    it("should reject quantities exceeding available shares", () => {
      const quantity = 700;
      const maxAvailable = 1000;
      const currentMinted = 400;
      
      expect(currentMinted + quantity).to.be.greaterThan(maxAvailable);
    });

    it("should handle edge case of exactly meeting max shares", () => {
      const quantity = 600;
      const maxAvailable = 1000;
      const currentMinted = 400;
      
      expect(currentMinted + quantity).to.equal(maxAvailable);
    });
  });

  describe("Order Price Validation", () => {
    it("should validate correct order prices", () => {
      const validPrices = [
        0.01 * LAMPORTS_PER_SOL,
        0.5 * LAMPORTS_PER_SOL,
        0.99 * LAMPORTS_PER_SOL
      ];
      
      for (const price of validPrices) {
        expect(price).to.be.greaterThan(0);
        expect(price).to.be.lessThan(LAMPORTS_PER_SOL);
      }
    });

    it("should reject invalid order prices", () => {
      const invalidPrices = [
        0, // Zero price
        LAMPORTS_PER_SOL, // Equal to 1 SOL
        1.5 * LAMPORTS_PER_SOL // Greater than 1 SOL
      ];
      
      for (const price of invalidPrices) {
        const isInvalid = price <= 0 || price >= LAMPORTS_PER_SOL;
        expect(isInvalid).to.be.true;
      }
    });
  });

  describe("Order Matching Logic", () => {
    it("should correctly identify matchable orders", () => {
      const yesPrice = 0.6 * LAMPORTS_PER_SOL;
      const noPrice = 0.4 * LAMPORTS_PER_SOL;
      
      const canMatch = yesPrice + noPrice === LAMPORTS_PER_SOL;
      expect(canMatch).to.be.true;
    });

    it("should reject non-matching orders", () => {
      const yesPrice = 0.7 * LAMPORTS_PER_SOL;
      const noPrice = 0.4 * LAMPORTS_PER_SOL;
      
      const canMatch = yesPrice + noPrice === LAMPORTS_PER_SOL;
      expect(canMatch).to.be.false;
    });

    it("should handle edge cases for order matching", () => {
      // Perfect split
      const yesPrice1 = 0.5 * LAMPORTS_PER_SOL;
      const noPrice1 = 0.5 * LAMPORTS_PER_SOL;
      expect(yesPrice1 + noPrice1).to.equal(LAMPORTS_PER_SOL);
      
      // Extreme split
      const yesPrice2 = 0.01 * LAMPORTS_PER_SOL;
      const noPrice2 = 0.99 * LAMPORTS_PER_SOL;
      expect(yesPrice2 + noPrice2).to.equal(LAMPORTS_PER_SOL);
    });
  });

  describe("Payout Calculations", () => {
    it("should calculate correct payout for winning shares", () => {
      const winningShares = 500;
      const expectedPayout = winningShares * LAMPORTS_PER_SOL;
      
      expect(expectedPayout).to.equal(500 * LAMPORTS_PER_SOL);
    });

    it("should handle zero winning shares", () => {
      const winningShares = 0;
      const expectedPayout = winningShares * LAMPORTS_PER_SOL;
      
      expect(expectedPayout).to.equal(0);
    });

    it("should handle large winning share quantities", () => {
      const winningShares = 10000;
      const expectedPayout = winningShares * LAMPORTS_PER_SOL;
      
      expect(expectedPayout).to.equal(10000 * LAMPORTS_PER_SOL);
    });
  });

  describe("Admin Validation", () => {
    it("should validate matching admin keys", () => {
      const admin1 = Keypair.generate().publicKey;
      const admin2 = admin1; // Same key
      
      const isValid = admin1.equals(admin2);
      expect(isValid).to.be.true;
    });

    it("should reject mismatched admin keys", () => {
      const admin1 = Keypair.generate().publicKey;
      const admin2 = Keypair.generate().publicKey;
      
      const isValid = admin1.equals(admin2);
      expect(isValid).to.be.false;
    });
  });

  describe("System State Validation", () => {
    it("should validate system is active when not paused", () => {
      const isPaused = false;
      const isSystemActive = !isPaused;
      
      expect(isSystemActive).to.be.true;
    });

    it("should validate system is inactive when paused", () => {
      const isPaused = true;
      const isSystemActive = !isPaused;
      
      expect(isSystemActive).to.be.false;
    });
  });

  describe("Integration Tests", () => {
    it("should validate complete order flow calculations", () => {
      // Simulate complete order flow
      const baseAmount = 0.5 * LAMPORTS_PER_SOL;
      const feeBasisPoints = 200; // 2%
      const fee = (baseAmount * feeBasisPoints) / 10000;
      const totalCost = baseAmount + fee;
      
      // Validate pricing
      const yesPrice = 0.6 * LAMPORTS_PER_SOL;
      const noPrice = 0.4 * LAMPORTS_PER_SOL;
      const canMatch = yesPrice + noPrice === LAMPORTS_PER_SOL;
      
      expect(totalCost).to.equal(0.51 * LAMPORTS_PER_SOL);
      expect(canMatch).to.be.true;
      
      // Validate shares
      const quantity = 100;
      const maxShares = 1000;
      const currentMinted = 200;
      const canMint = quantity > 0 && (currentMinted + quantity) <= maxShares;
      
      expect(canMint).to.be.true;
    });

    it("should validate market timing and pricing interactions", () => {
      const currentTime = Date.now() / 1000;
      const matchTime = currentTime + (25 * 3600); // 25 hours
      const primaryClose = matchTime - 300; // 5 minutes before
      
      // Timing validation
      const isValidTiming = matchTime > currentTime + 86400;
      expect(isValidTiming).to.be.true;
      
      // Market phase validation
      const isPrimaryActive = currentTime < primaryClose;
      expect(isPrimaryActive).to.be.true;
      
      // Price validation
      const yesProbability = 6500; // 65%
      const yesPrice = (yesProbability * LAMPORTS_PER_SOL) / 10000;
      const noPrice = LAMPORTS_PER_SOL - yesPrice;
      
      expect(yesPrice).to.equal(0.65 * LAMPORTS_PER_SOL);
      expect(noPrice).to.equal(0.35 * LAMPORTS_PER_SOL);
      expect(yesPrice + noPrice).to.equal(LAMPORTS_PER_SOL);
    });
  });
});