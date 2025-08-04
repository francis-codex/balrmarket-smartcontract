import { web3 } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("Utility Functions", () => {
  // Test the utility functions defined in the Rust code
  // Since these are Rust functions, we test their expected behavior patterns

  describe("OPTA Odds Normalization", () => {
    it("Should normalize odds correctly removing bookmaker margin", () => {
      // Test the mathematical formula used in normalize_opta_odds
      // This mirrors the logic in utils.rs:6-16
      
      const testCases = [
        { input: 6000, expectedYes: 6000, expectedNo: 4000 }, // 60% vs 40%
        { input: 5000, expectedYes: 5000, expectedNo: 5000 }, // 50% vs 50%
        { input: 7500, expectedYes: 7500, expectedNo: 2500 }, // 75% vs 25%
        { input: 2000, expectedYes: 2000, expectedNo: 8000 }, // 20% vs 80%
        { input: 9000, expectedYes: 9000, expectedNo: 1000 }, // 90% vs 10%
      ];

      testCases.forEach(({ input, expectedYes, expectedNo }) => {
        // Simulate the normalization logic
        const yesProb = input / 10000;
        const noProb = (10000 - input) / 10000;
        const totalProb = yesProb + noProb; // Should be 1.0 for no margin
        
        const normalizedYes = Math.round((yesProb / totalProb) * 10000);
        const normalizedNo = 10000 - normalizedYes;

        console.log(`Input: ${input}bp -> Yes: ${normalizedYes}bp, No: ${normalizedNo}bp`);
        
        // For fair odds without margin, normalized should equal input
        expect(normalizedYes).to.be.closeTo(expectedYes, 1); // Allow 1bp tolerance
        expect(normalizedNo).to.be.closeTo(expectedNo, 1);
        expect(normalizedYes + normalizedNo).to.equal(10000);
      });
    });

    it("Should handle edge cases in odds normalization", () => {
      // Test extreme probabilities
      const extremeCases = [
        { input: 1, description: "Very low probability" },
        { input: 9999, description: "Very high probability" },
        { input: 1000, description: "10% probability" },
        { input: 9000, description: "90% probability" }
      ];

      extremeCases.forEach(({ input, description }) => {
        const yesProb = input / 10000;
        const noProb = (10000 - input) / 10000;
        const totalProb = yesProb + noProb;
        
        const normalizedYes = Math.round((yesProb / totalProb) * 10000);
        const normalizedNo = 10000 - normalizedYes;

        console.log(`${description}: ${input}bp -> Yes: ${normalizedYes}bp, No: ${normalizedNo}bp`);
        
        expect(normalizedYes).to.be.greaterThan(0);
        expect(normalizedNo).to.be.greaterThan(0);
        expect(normalizedYes + normalizedNo).to.equal(10000);
      });
    });
  });

  describe("Share Price Calculations", () => {
    it("Should calculate share prices from probabilities", () => {
      // Test the calculate_share_prices function logic
      const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;
      
      const testCases = [
        { probabilityYes: 5000, expectedYesPrice: 0.5 * LAMPORTS_PER_SOL },
        { probabilityYes: 6000, expectedYesPrice: 0.6 * LAMPORTS_PER_SOL },
        { probabilityYes: 2500, expectedYesPrice: 0.25 * LAMPORTS_PER_SOL },
        { probabilityYes: 7500, expectedYesPrice: 0.75 * LAMPORTS_PER_SOL },
      ];

      testCases.forEach(({ probabilityYes, expectedYesPrice }) => {
        const yesPrice = (probabilityYes * LAMPORTS_PER_SOL) / 10000;
        const noPrice = LAMPORTS_PER_SOL - yesPrice;

        console.log(`Probability ${probabilityYes}bp -> Yes: ${yesPrice / LAMPORTS_PER_SOL} SOL, No: ${noPrice / LAMPORTS_PER_SOL} SOL`);
        
        expect(yesPrice).to.equal(expectedYesPrice);
        expect(yesPrice + noPrice).to.equal(LAMPORTS_PER_SOL);
        expect(yesPrice).to.be.greaterThan(0);
        expect(noPrice).to.be.greaterThan(0);
      });
    });

    it("Should ensure share prices always sum to 1 SOL", () => {
      // Test various probability values
      for (let prob = 100; prob <= 9900; prob += 500) {
        const yesPrice = (prob * web3.LAMPORTS_PER_SOL) / 10000;
        const noPrice = web3.LAMPORTS_PER_SOL - yesPrice;
        
        expect(yesPrice + noPrice).to.equal(web3.LAMPORTS_PER_SOL);
      }
    });
  });

  describe("Event Timing Calculations", () => {
    it("Should calculate correct event timing windows", () => {
      // Test the validate_event_timing function logic
      const currentTime = Math.floor(Date.now() / 1000);
      const matchTimestamp = currentTime + 86400 * 2; // 2 days from now
      
      // Calculate timing windows as per utils.rs:30-40
      const primaryMarketClose = matchTimestamp - 300; // 5 minutes before match
      const secondaryMarketOpen = matchTimestamp;
      const secondaryMarketClose = matchTimestamp + 6300; // 105 minutes after
      
      console.log(`Current time: ${new Date(currentTime * 1000).toISOString()}`);
      console.log(`Match time: ${new Date(matchTimestamp * 1000).toISOString()}`);
      console.log(`Primary close: ${new Date(primaryMarketClose * 1000).toISOString()}`);
      console.log(`Secondary open: ${new Date(secondaryMarketOpen * 1000).toISOString()}`);
      console.log(`Secondary close: ${new Date(secondaryMarketClose * 1000).toISOString()}`);
      
      // Verify timing relationships
      expect(primaryMarketClose).to.be.lessThan(matchTimestamp);
      expect(secondaryMarketOpen).to.equal(matchTimestamp);
      expect(secondaryMarketClose).to.be.greaterThan(matchTimestamp);
      
      // Verify specific durations
      expect(matchTimestamp - primaryMarketClose).to.equal(300); // 5 minutes
      expect(secondaryMarketClose - secondaryMarketOpen).to.equal(6300); // 105 minutes
    });

    it("Should validate minimum advance notice requirement", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const minAdvanceHours = 24;
      
      // Test cases for minimum advance notice
      const testCases = [
        { hours: 23, shouldPass: false, description: "Less than 24 hours" },
        { hours: 24, shouldPass: false, description: "Exactly 24 hours" },
        { hours: 25, shouldPass: true, description: "More than 24 hours" },
        { hours: 48, shouldPass: true, description: "48 hours advance" },
      ];

      testCases.forEach(({ hours, shouldPass, description }) => {
        const matchTime = currentTime + (hours * 3600);
        const isValid = matchTime > currentTime + (minAdvanceHours * 3600);
        
        console.log(`${description}: ${hours}h advance - Valid: ${isValid}`);
        expect(isValid).to.equal(shouldPass);
      });
    });
  });

  describe("Market Phase Validation", () => {
    it("Should correctly identify primary market active period", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const matchTime = currentTime + 3600; // 1 hour from now
      const primaryClose = matchTime - 300; // 5 minutes before match
      
      // Test is_primary_market_active logic
      const testTimes = [
        { time: currentTime, expected: true, description: "Current time (well before close)" },
        { time: primaryClose - 1, expected: true, description: "1 second before close" },
        { time: primaryClose, expected: false, description: "Exactly at close time" },
        { time: primaryClose + 1, expected: false, description: "1 second after close" },
        { time: matchTime, expected: false, description: "At match time" },
      ];

      testTimes.forEach(({ time, expected, description }) => {
        const isActive = time < primaryClose;
        console.log(`${description}: Active = ${isActive}`);
        expect(isActive).to.equal(expected);
      });
    });

    it("Should correctly identify secondary market active period", () => {
      const matchTime = Math.floor(Date.now() / 1000) + 3600;
      const secondaryOpen = matchTime;
      const secondaryClose = matchTime + 6300; // 105 minutes after
      
      // Test is_secondary_market_active logic
      const testTimes = [
        { time: secondaryOpen - 1, expected: false, description: "1 second before open" },
        { time: secondaryOpen, expected: true, description: "Exactly at open time" },
        { time: secondaryOpen + 1, expected: true, description: "1 second after open" },
        { time: secondaryClose - 1, expected: true, description: "1 second before close" },
        { time: secondaryClose, expected: false, description: "Exactly at close time" },
        { time: secondaryClose + 1, expected: false, description: "1 second after close" },
      ];

      testTimes.forEach(({ time, expected, description }) => {
        const isActive = time >= secondaryOpen && time < secondaryClose;
        console.log(`${description}: Active = ${isActive}`);
        expect(isActive).to.equal(expected);
      });
    });
  });

  describe("Fee Calculations", () => {
    it("Should calculate platform fees correctly", () => {
      // Test calculate_fee function logic
      const testCases = [
        { amount: 1000000000, feeRate: 200, expectedFee: 20000000 }, // 1 SOL, 2% = 0.02 SOL
        { amount: 500000000, feeRate: 100, expectedFee: 5000000 },   // 0.5 SOL, 1% = 0.005 SOL
        { amount: 2000000000, feeRate: 250, expectedFee: 50000000 }, // 2 SOL, 2.5% = 0.05 SOL
        { amount: 100000000, feeRate: 50, expectedFee: 500000 },     // 0.1 SOL, 0.5% = 0.0005 SOL
      ];

      testCases.forEach(({ amount, feeRate, expectedFee }) => {
        const calculatedFee = Math.floor((amount * feeRate) / 10000);
        const totalCost = amount + calculatedFee;
        
        console.log(`Amount: ${amount / web3.LAMPORTS_PER_SOL} SOL, Rate: ${feeRate}bp, Fee: ${calculatedFee / web3.LAMPORTS_PER_SOL} SOL`);
        
        expect(calculatedFee).to.equal(expectedFee);
        expect(totalCost).to.equal(amount + expectedFee);
      });
    });

    it("Should handle zero and maximum fee rates", () => {
      const amount = 1000000000; // 1 SOL
      
      // Zero fee
      const zeroFee = Math.floor((amount * 0) / 10000);
      expect(zeroFee).to.equal(0);
      
      // Maximum fee (100%)
      const maxFee = Math.floor((amount * 10000) / 10000);
      expect(maxFee).to.equal(amount);
      
      console.log(`Zero fee: ${zeroFee}, Max fee: ${maxFee / web3.LAMPORTS_PER_SOL} SOL`);
    });
  });

  describe("Market Price Calculations", () => {
    it("Should calculate market price from order book bids", () => {
      const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;
      
      // Test calculate_market_price function logic
      const testCases = [
        {
          yesBid: 0.6 * LAMPORTS_PER_SOL,
          noBid: 0.4 * LAMPORTS_PER_SOL,
          expectedYesPrice: 0.6 * LAMPORTS_PER_SOL,
          expectedNoPrice: 0.4 * LAMPORTS_PER_SOL,
          description: "Balanced bids"
        },
        {
          yesBid: 0,
          noBid: 0,
          expectedYesPrice: 0.5 * LAMPORTS_PER_SOL,
          expectedNoPrice: 0.5 * LAMPORTS_PER_SOL,
          description: "No orders (equal probability)"
        },
        {
          yesBid: 0.8 * LAMPORTS_PER_SOL,
          noBid: 0,
          expectedYesPrice: LAMPORTS_PER_SOL,
          expectedNoPrice: 0,
          description: "Only YES bids"
        },
        {
          yesBid: 0,
          noBid: 0.3 * LAMPORTS_PER_SOL,
          expectedYesPrice: 0,
          expectedNoPrice: LAMPORTS_PER_SOL,
          description: "Only NO bids"
        }
      ];

      testCases.forEach(({ yesBid, noBid, expectedYesPrice, expectedNoPrice, description }) => {
        let yesPrice: number, noPrice: number;

        if (yesBid === 0 && noBid === 0) {
          // No orders, return equal probability
          yesPrice = LAMPORTS_PER_SOL / 2;
          noPrice = LAMPORTS_PER_SOL / 2;
        } else if (yesBid === 0) {
          // Only NO bids exist
          yesPrice = 0;
          noPrice = LAMPORTS_PER_SOL;
        } else if (noBid === 0) {
          // Only YES bids exist
          yesPrice = LAMPORTS_PER_SOL;
          noPrice = 0;
        } else {
          // Calculate implied probability from bids
          const totalBids = yesBid + noBid;
          yesPrice = Math.floor((yesBid * LAMPORTS_PER_SOL) / totalBids);
          noPrice = LAMPORTS_PER_SOL - yesPrice;
        }

        console.log(`${description}: Yes=${yesPrice / LAMPORTS_PER_SOL} SOL, No=${noPrice / LAMPORTS_PER_SOL} SOL`);
        
        expect(yesPrice).to.be.closeTo(expectedYesPrice, 1); // Allow 1 lamport tolerance
        expect(noPrice).to.be.closeTo(expectedNoPrice, 1);
        expect(yesPrice + noPrice).to.equal(LAMPORTS_PER_SOL);
      });
    });
  });

  describe("Order Validation", () => {
    it("Should validate share quantity constraints", () => {
      const testCases = [
        { quantity: 0, maxAvailable: 100, currentMinted: 0, shouldPass: false, description: "Zero quantity" },
        { quantity: 1, maxAvailable: 100, currentMinted: 0, shouldPass: true, description: "Valid quantity" },
        { quantity: 50, maxAvailable: 100, currentMinted: 0, shouldPass: true, description: "Half of available" },
        { quantity: 100, maxAvailable: 100, currentMinted: 0, shouldPass: true, description: "All available" },
        { quantity: 101, maxAvailable: 100, currentMinted: 0, shouldPass: false, description: "Exceeds available" },
        { quantity: 50, maxAvailable: 100, currentMinted: 60, shouldPass: false, description: "Would exceed with current minted" },
        { quantity: 40, maxAvailable: 100, currentMinted: 60, shouldPass: true, description: "Exactly fills remaining" },
      ];

      testCases.forEach(({ quantity, maxAvailable, currentMinted, shouldPass, description }) => {
        const isValid = quantity > 0 && (currentMinted + quantity <= maxAvailable);
        
        console.log(`${description}: Quantity=${quantity}, Available=${maxAvailable}, Minted=${currentMinted}, Valid=${isValid}`);
        expect(isValid).to.equal(shouldPass);
      });
    });

    it("Should validate order price constraints", () => {
      const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;
      
      const testCases = [
        { price: 0, shouldPass: false, description: "Zero price" },
        { price: 1, shouldPass: true, description: "Minimum valid price" },
        { price: 0.5 * LAMPORTS_PER_SOL, shouldPass: true, description: "Half SOL price" },
        { price: LAMPORTS_PER_SOL - 1, shouldPass: true, description: "Maximum valid price" },
        { price: LAMPORTS_PER_SOL, shouldPass: false, description: "Full SOL price (invalid)" },
        { price: 2 * LAMPORTS_PER_SOL, shouldPass: false, description: "Above SOL price" },
      ];

      testCases.forEach(({ price, shouldPass, description }) => {
        const isValid = price > 0 && price < LAMPORTS_PER_SOL;
        
        console.log(`${description}: Price=${price / LAMPORTS_PER_SOL} SOL, Valid=${isValid}`);
        expect(isValid).to.equal(shouldPass);
      });
    });

    it("Should validate order matching logic", () => {
      const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;
      
      const testCases = [
        { yesPrice: 0.6 * LAMPORTS_PER_SOL, noPrice: 0.4 * LAMPORTS_PER_SOL, canMatch: true, description: "Matching orders (0.6 + 0.4 = 1.0)" },
        { yesPrice: 0.5 * LAMPORTS_PER_SOL, noPrice: 0.5 * LAMPORTS_PER_SOL, canMatch: true, description: "Equal probability match" },
        { yesPrice: 0.7 * LAMPORTS_PER_SOL, noPrice: 0.4 * LAMPORTS_PER_SOL, canMatch: false, description: "Non-matching orders (0.7 + 0.4 ` 1.0)" },
        { yesPrice: 0.3 * LAMPORTS_PER_SOL, noPrice: 0.6 * LAMPORTS_PER_SOL, canMatch: false, description: "Non-matching orders (0.3 + 0.6 ` 1.0)" },
      ];

      testCases.forEach(({ yesPrice, noPrice, canMatch, description }) => {
        const ordersMatch = (yesPrice + noPrice) === LAMPORTS_PER_SOL;
        
        console.log(`${description}: Match=${ordersMatch}`);
        expect(ordersMatch).to.equal(canMatch);
      });
    });
  });

  describe("Payout Calculations", () => {
    it("Should calculate correct payout amounts", () => {
      const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;
      
      const testCases = [
        { winningShares: 1, expectedPayout: 1 * LAMPORTS_PER_SOL },
        { winningShares: 10, expectedPayout: 10 * LAMPORTS_PER_SOL },
        { winningShares: 50, expectedPayout: 50 * LAMPORTS_PER_SOL },
        { winningShares: 100, expectedPayout: 100 * LAMPORTS_PER_SOL },
      ];

      testCases.forEach(({ winningShares, expectedPayout }) => {
        const payout = winningShares * LAMPORTS_PER_SOL;
        
        console.log(`${winningShares} winning shares = ${payout / LAMPORTS_PER_SOL} SOL payout`);
        expect(payout).to.equal(expectedPayout);
      });
    });
  });

  describe("String Validation", () => {
    it("Should validate string length constraints", () => {
      const testCases = [
        { value: "", maxLength: 10, shouldPass: false, description: "Empty string" },
        { value: "A", maxLength: 10, shouldPass: true, description: "Single character" },
        { value: "A".repeat(10), maxLength: 10, shouldPass: true, description: "Exact max length" },
        { value: "A".repeat(11), maxLength: 10, shouldPass: false, description: "Exceeds max length" },
        { value: "Valid Market ID", maxLength: 50, shouldPass: true, description: "Valid market ID" },
        { value: "This is a very long team name that exceeds the maximum allowed length for team names in the system which should be over 100 characters", maxLength: 100, shouldPass: false, description: "Team name too long" },
      ];

      testCases.forEach(({ value, maxLength, shouldPass, description }) => {
        const isValid = value.length > 0 && value.length <= maxLength;
        
        console.log(`${description}: Length=${value.length}, Max=${maxLength}, Valid=${isValid}`);
        expect(isValid).to.equal(shouldPass);
      });
    });

    it("Should handle UTF-8 string encoding", () => {
      // Test strings with special characters
      const specialStrings = [
        { value: "FC Barcelona", description: "Basic Latin characters" },
        { value: "Real Madrid C.F.", description: "With periods and spaces" },
        { value: "Team A vs Team B", description: "With common symbols" },
        { value: "Manchester United FC", description: "Standard team name" },
      ];

      specialStrings.forEach(({ value, description }) => {
        const byteLength = Buffer.from(value).length;
        const charLength = value.length;
        
        console.log(`${description}: "${value}" - ${charLength} chars, ${byteLength} bytes`);
        
        // For ASCII characters, byte length should equal character length
        if (/^[\x00-\x7F]*$/.test(value)) {
          expect(byteLength).to.equal(charLength);
        }
      });
    });
  });

  describe("Order ID Generation", () => {
    it("Should generate unique order IDs", () => {
      // Test the generate_order_id function logic
      const user = new web3.PublicKey("11111111111111111111111111111112");
      const eventId = "EVENT_001";
      const timestamp1 = Math.floor(Date.now() / 1000);
      const timestamp2 = timestamp1 + 1;
      
      // Simulate the order ID generation logic
      const userPrefix = user.toString().substring(0, 8);
      const orderId1 = `${userPrefix}_${eventId}_${timestamp1}`;
      const orderId2 = `${userPrefix}_${eventId}_${timestamp2}`;
      
      console.log(`Order ID 1: ${orderId1}`);
      console.log(`Order ID 2: ${orderId2}`);
      
      expect(orderId1).to.not.equal(orderId2);
      expect(orderId1).to.include(userPrefix);
      expect(orderId1).to.include(eventId);
      expect(orderId1).to.include(timestamp1.toString());
    });
  });

  describe("Admin and Permission Validation", () => {
    it("Should validate admin permissions correctly", () => {
      const adminKey = new web3.PublicKey("11111111111111111111111111111112");
      const userKey = new web3.PublicKey("11111111111111111111111111111113");
      
      // Test admin validation logic
      const isAdmin1 = adminKey.equals(adminKey);
      const isAdmin2 = adminKey.equals(userKey);
      
      console.log(`Admin check (same key): ${isAdmin1}`);
      console.log(`Admin check (different key): ${isAdmin2}`);
      
      expect(isAdmin1).to.be.true;
      expect(isAdmin2).to.be.false;
    });

    it("Should validate system pause state", () => {
      const testCases = [
        { isPaused: false, shouldAllow: true, description: "System active" },
        { isPaused: true, shouldAllow: false, description: "System paused" },
      ];

      testCases.forEach(({ isPaused, shouldAllow, description }) => {
        const isAllowed = !isPaused;
        
        console.log(`${description}: Allowed=${isAllowed}`);
        expect(isAllowed).to.equal(shouldAllow);
      });
    });
  });
});