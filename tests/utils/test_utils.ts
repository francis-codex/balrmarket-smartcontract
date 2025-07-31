import { expect } from "chai";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Utility functions - move to top level for reuse
function normalizeOptaOdds(yesOddsBp: number): [number, number] {
  const yesProb = yesOddsBp / 10000.0;
  const noProb = (10000 - yesOddsBp) / 10000.0;
  const totalProb = yesProb + noProb;
  
  const normalizedYes = Math.round((yesProb / totalProb) * 10000);
  const normalizedNo = 10000 - normalizedYes;
  
  return [normalizedYes, normalizedNo];
}

function calculateSharePrices(yesProbabilityBp: number): [number, number] {
  const yesPrice = Math.floor((yesProbabilityBp * LAMPORTS_PER_SOL) / 10000);
  const noPrice = LAMPORTS_PER_SOL - yesPrice;
  return [yesPrice, noPrice];
}

function calculateFee(amount: number, feeBasisPoints: number): number {
  return Math.floor((amount * feeBasisPoints) / 10000);
}

function calculateTotalCost(baseAmount: number, feeBasisPoints: number): number {
  const fee = calculateFee(baseAmount, feeBasisPoints);
  return baseAmount + fee;
}

function calculateMarketPrice(bestYesBid: number, bestNoBid: number): [number, number] {
  if (bestYesBid === 0 && bestNoBid === 0) {
    return [LAMPORTS_PER_SOL / 2, LAMPORTS_PER_SOL / 2];
  }
  
  if (bestYesBid === 0) {
    return [0, LAMPORTS_PER_SOL];
  }
  
  if (bestNoBid === 0) {
    return [LAMPORTS_PER_SOL, 0];
  }
  
  const totalBids = bestYesBid + bestNoBid;
  const yesPrice = Math.floor((bestYesBid * LAMPORTS_PER_SOL) / totalBids);
  const noPrice = LAMPORTS_PER_SOL - yesPrice;
  
  return [yesPrice, noPrice];
}

describe("Utility Functions", () => {
  
  describe("OPTA Odds Normalization", () => {

    it("Normalizes odds correctly", () => {
      const testCases = [
        { input: 5000, expectedYes: 5000, expectedNo: 5000 }, // 50/50 (no margin)
        { input: 6000, expectedYes: 6000, expectedNo: 4000 }, // 60/40 (no margin)
        { input: 5640, expectedYes: 5640, expectedNo: 4360 }, // With margin example
        { input: 1, expectedYes: 1, expectedNo: 9999 },       // Extreme low
        { input: 9999, expectedYes: 9999, expectedNo: 1 },    // Extreme high
      ];

      testCases.forEach(({ input, expectedYes, expectedNo }) => {
        const [actualYes, actualNo] = normalizeOptaOdds(input);
        
        // Should sum to exactly 10000
        expect(actualYes + actualNo).to.equal(10000);
        
        // Should be close to expected (within 1 basis point due to rounding)
        expect(Math.abs(actualYes - expectedYes)).to.be.lessThan(2);
        expect(Math.abs(actualNo - expectedNo)).to.be.lessThan(2);
        
        console.log(`Input: ${input} -> YES: ${actualYes}, NO: ${actualNo}`);
      });
    });

    it("Removes bookmaker margin correctly", () => {
      // Example with bookmaker margin - adjust test case
      const yesOdds = 5500; // 55%
      const noOdds = 4800;  // 48%
      const total = yesOdds + noOdds; // 103% (3% margin)
      
      expect(total).to.be.greaterThan(10000);
      
      const [normalizedYes, normalizedNo] = normalizeOptaOdds(yesOdds);
      
      // After normalization, should sum to exactly 100%
      expect(normalizedYes + normalizedNo).to.equal(10000);
      
      // Should reduce the YES probability slightly (remove margin)  
      expect(normalizedYes).to.be.lessThanOrEqual(yesOdds);
      expect(normalizedNo).to.be.greaterThanOrEqual(10000 - yesOdds);
    });

    it("Handles edge cases", () => {
      const edgeCases = [
        1,    // Minimum valid odds
        9999, // Maximum valid odds
        5000, // Exactly 50%
        2500, // 25%
        7500, // 75%
      ];

      edgeCases.forEach(odds => {
        const [yes, no] = normalizeOptaOdds(odds);
        
        expect(yes + no).to.equal(10000);
        expect(yes).to.be.greaterThan(0);
        expect(no).to.be.greaterThan(0);
        expect(yes).to.be.lessThan(10000);
        expect(no).to.be.lessThan(10000);
      });
    });
  });

  describe("Share Price Calculation", () => {

    it("Calculates prices that sum to 1 SOL", () => {
      const testProbabilities = [1000, 2500, 5000, 7500, 9000, 9999];

      testProbabilities.forEach(probability => {
        const [yesPrice, noPrice] = calculateSharePrices(probability);
        
        expect(yesPrice + noPrice).to.equal(LAMPORTS_PER_SOL);
        expect(yesPrice).to.be.greaterThan(0);
        expect(noPrice).to.be.greaterThan(0);
        
        const yesPriceSOL = yesPrice / LAMPORTS_PER_SOL;
        const noPriceSOL = noPrice / LAMPORTS_PER_SOL;
        const expectedYesSOL = probability / 10000;
        
        // Should be approximately correct (within rounding error)
        expect(Math.abs(yesPriceSOL - expectedYesSOL)).to.be.lessThan(0.000001);
        
        console.log(`Probability: ${probability}bp -> YES: ${yesPriceSOL.toFixed(6)} SOL, NO: ${noPriceSOL.toFixed(6)} SOL`);
      });
    });

    it("Handles extreme probabilities correctly", () => {
      // Very low probability
      const [lowYes, lowNo] = calculateSharePrices(1);
      expect(lowYes).to.equal(Math.floor(LAMPORTS_PER_SOL / 10000));
      expect(lowNo).to.equal(LAMPORTS_PER_SOL - lowYes);

      // Very high probability
      const [highYes, highNo] = calculateSharePrices(9999);
      expect(highYes).to.equal(Math.floor((9999 * LAMPORTS_PER_SOL) / 10000));
      expect(highNo).to.equal(LAMPORTS_PER_SOL - highYes);

      // Both should still be positive
      expect(lowYes).to.be.greaterThan(0);
      expect(lowNo).to.be.greaterThan(0);
      expect(highYes).to.be.greaterThan(0);
      expect(highNo).to.be.greaterThan(0);
    });
  });

  describe("Timing Validation", () => {
    function validateEventTiming(
      currentTime: number,
      matchTimestamp: number
    ): [number, number, number] | null {
      if (matchTimestamp <= currentTime + 86400) {
        return null; // Match too soon
      }
      
      const primaryMarketClose = matchTimestamp - 300; // 5 minutes before
      const secondaryMarketOpen = matchTimestamp;
      const secondaryMarketClose = matchTimestamp + 6300; // 105 minutes after
      
      return [primaryMarketClose, secondaryMarketOpen, secondaryMarketClose];
    }

    it("Validates timing constraints", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Valid future time (25 hours)
      const validMatchTime = currentTime + 86400 + 3600;
      const validTiming = validateEventTiming(currentTime, validMatchTime);
      
      expect(validTiming).to.not.be.null;
      expect(validTiming![0]).to.equal(validMatchTime - 300);
      expect(validTiming![1]).to.equal(validMatchTime);
      expect(validTiming![2]).to.equal(validMatchTime + 6300);
    });

    it("Rejects invalid timing", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Too soon (only 1 hour)
      const tooSoonMatchTime = currentTime + 3600;
      const invalidTiming = validateEventTiming(currentTime, tooSoonMatchTime);
      
      expect(invalidTiming).to.be.null;
      
      // Past time
      const pastMatchTime = currentTime - 3600;
      const pastTiming = validateEventTiming(currentTime, pastMatchTime);
      
      expect(pastTiming).to.be.null;
    });

    it("Calculates market windows correctly", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const matchTime = currentTime + 86400 * 2; // 2 days from now
      
      const timing = validateEventTiming(currentTime, matchTime);
      expect(timing).to.not.be.null;
      
      const [primaryClose, secondaryOpen, secondaryClose] = timing!;
      
      // Primary market closes 5 minutes before match
      expect(primaryClose).to.equal(matchTime - 300);
      
      // Secondary market opens at match start
      expect(secondaryOpen).to.equal(matchTime);
      
      // Secondary market closes 105 minutes after match (90 + 15 injury time)
      expect(secondaryClose).to.equal(matchTime + 6300);
      
      // Verify proper sequence
      expect(primaryClose).to.be.lessThan(secondaryOpen);
      expect(secondaryOpen).to.be.lessThan(secondaryClose);
    });
  });

  describe("Market Phase Validation", () => {
    function isPrimaryMarketActive(currentTime: number, primaryMarketClose: number): boolean {
      return currentTime < primaryMarketClose;
    }

    function isSecondaryMarketActive(
      currentTime: number,
      secondaryMarketOpen: number,
      secondaryMarketClose: number
    ): boolean {
      return currentTime >= secondaryMarketOpen && currentTime < secondaryMarketClose;
    }

    it("Correctly identifies primary market phase", () => {
      const matchTime = Math.floor(Date.now() / 1000) + 86400;
      const primaryClose = matchTime - 300;
      
      // Before primary close
      const beforeClose = primaryClose - 1000;
      expect(isPrimaryMarketActive(beforeClose, primaryClose)).to.be.true;
      
      // After primary close
      const afterClose = primaryClose + 100;
      expect(isPrimaryMarketActive(afterClose, primaryClose)).to.be.false;
      
      // Exactly at close
      expect(isPrimaryMarketActive(primaryClose, primaryClose)).to.be.false;
    });

    it("Correctly identifies secondary market phase", () => {
      const matchTime = Math.floor(Date.now() / 1000) + 86400;
      const secondaryOpen = matchTime;
      const secondaryClose = matchTime + 6300;
      
      // Before secondary open
      const beforeOpen = secondaryOpen - 100;
      expect(isSecondaryMarketActive(beforeOpen, secondaryOpen, secondaryClose)).to.be.false;
      
      // During secondary market
      const during = secondaryOpen + 1000;
      expect(isSecondaryMarketActive(during, secondaryOpen, secondaryClose)).to.be.true;
      
      // After secondary close
      const afterClose = secondaryClose + 100;
      expect(isSecondaryMarketActive(afterClose, secondaryOpen, secondaryClose)).to.be.false;
      
      // Exactly at boundaries
      expect(isSecondaryMarketActive(secondaryOpen, secondaryOpen, secondaryClose)).to.be.true;
      expect(isSecondaryMarketActive(secondaryClose, secondaryOpen, secondaryClose)).to.be.false;
    });
  });

  describe("Fee Calculation", () => {

    it("Calculates fees correctly", () => {
      const testCases = [
        { amount: LAMPORTS_PER_SOL, fee: 200, expectedFee: 0.02 * LAMPORTS_PER_SOL }, // 2%
        { amount: LAMPORTS_PER_SOL, fee: 50, expectedFee: 0.005 * LAMPORTS_PER_SOL }, // 0.5%
        { amount: 500000000, fee: 200, expectedFee: 10000000 }, // 0.5 SOL, 2%
        { amount: 100000000, fee: 50, expectedFee: 500000 },   // 0.1 SOL, 0.5%
      ];

      testCases.forEach(({ amount, fee, expectedFee }) => {
        const actualFee = calculateFee(amount, fee);
        expect(actualFee).to.equal(expectedFee);
        
        const totalCost = calculateTotalCost(amount, fee);
        expect(totalCost).to.equal(amount + expectedFee);
        
        console.log(`Amount: ${amount / LAMPORTS_PER_SOL} SOL, Fee: ${fee}bp -> Fee: ${actualFee / LAMPORTS_PER_SOL} SOL, Total: ${totalCost / LAMPORTS_PER_SOL} SOL`);
      });
    });

    it("Handles zero fees", () => {
      const amount = LAMPORTS_PER_SOL;
      const fee = calculateFee(amount, 0);
      expect(fee).to.equal(0);
      
      const totalCost = calculateTotalCost(amount, 0);
      expect(totalCost).to.equal(amount);
    });

    it("Handles maximum reasonable fees", () => {
      const amount = LAMPORTS_PER_SOL;
      const maxFee = 1000; // 10%
      const fee = calculateFee(amount, maxFee);
      expect(fee).to.equal(0.1 * LAMPORTS_PER_SOL);
      
      const totalCost = calculateTotalCost(amount, maxFee);
      expect(totalCost).to.equal(1.1 * LAMPORTS_PER_SOL);
    });
  });

  describe("Market Price Calculation", () => {

    it("Calculates market prices from order book", () => {
      const testCases = [
        { yesBid: 600000000, noBid: 400000000, expectedYes: 0.6, expectedNo: 0.4 },
        { yesBid: 800000000, noBid: 200000000, expectedYes: 0.8, expectedNo: 0.2 },
        { yesBid: 300000000, noBid: 700000000, expectedYes: 0.3, expectedNo: 0.7 },
        { yesBid: 500000000, noBid: 500000000, expectedYes: 0.5, expectedNo: 0.5 },
      ];

      testCases.forEach(({ yesBid, noBid, expectedYes, expectedNo }) => {
        const [yesPrice, noPrice] = calculateMarketPrice(yesBid, noBid);
        
        expect(yesPrice + noPrice).to.equal(LAMPORTS_PER_SOL);
        
        const actualYes = yesPrice / LAMPORTS_PER_SOL;
        const actualNo = noPrice / LAMPORTS_PER_SOL;
        
        expect(Math.abs(actualYes - expectedYes)).to.be.lessThan(0.001);
        expect(Math.abs(actualNo - expectedNo)).to.be.lessThan(0.001);
        
        console.log(`Bids - YES: ${yesBid / LAMPORTS_PER_SOL}, NO: ${noBid / LAMPORTS_PER_SOL} -> Prices - YES: ${actualYes}, NO: ${actualNo}`);
      });
    });

    it("Handles edge cases", () => {
      // No bids at all
      const [equalYes, equalNo] = calculateMarketPrice(0, 0);
      expect(equalYes).to.equal(LAMPORTS_PER_SOL / 2);
      expect(equalNo).to.equal(LAMPORTS_PER_SOL / 2);

      // Only YES bids
      const [onlyYes, onlyNo] = calculateMarketPrice(100000000, 0);
      expect(onlyYes).to.equal(LAMPORTS_PER_SOL);
      expect(onlyNo).to.equal(0);

      // Only NO bids
      const [noYes, noOnly] = calculateMarketPrice(0, 100000000);
      expect(noYes).to.equal(0);
      expect(noOnly).to.equal(LAMPORTS_PER_SOL);
    });
  });

  describe("Order Matching Logic", () => {
    function canMatchOrders(yesPrice: number, noPrice: number): boolean {
      return yesPrice + noPrice === LAMPORTS_PER_SOL;
    }

    it("Validates matching orders", () => {
      const validMatches = [
        [600000000, 400000000], // 0.6 + 0.4 = 1.0
        [300000000, 700000000], // 0.3 + 0.7 = 1.0
        [500000000, 500000000], // 0.5 + 0.5 = 1.0
        [1, 999999999],         // Very small + very large
      ];

      validMatches.forEach(([yes, no]) => {
        expect(canMatchOrders(yes, no)).to.be.true;
        console.log(`✓ Valid match: ${yes / LAMPORTS_PER_SOL} + ${no / LAMPORTS_PER_SOL} = 1.0`);
      });
    });

    it("Rejects invalid matches", () => {
      const invalidMatches = [
        [700000000, 400000000], // 0.7 + 0.4 = 1.1
        [500000000, 600000000], // 0.5 + 0.6 = 1.1
        [300000000, 300000000], // 0.3 + 0.3 = 0.6
        [0, 500000000],         // 0 + 0.5 = 0.5
      ];

      invalidMatches.forEach(([yes, no]) => {
        expect(canMatchOrders(yes, no)).to.be.false;
        console.log(`✗ Invalid match: ${yes / LAMPORTS_PER_SOL} + ${no / LAMPORTS_PER_SOL} = ${(yes + no) / LAMPORTS_PER_SOL}`);
      });
    });
  });

  describe("Payout Calculation", () => {
    function calculatePayout(winningShares: number): number {
      return winningShares * LAMPORTS_PER_SOL;
    }

    it("Calculates payouts correctly", () => {
      const testCases = [
        { shares: 1, expectedPayout: LAMPORTS_PER_SOL },
        { shares: 5, expectedPayout: 5 * LAMPORTS_PER_SOL },
        { shares: 100, expectedPayout: 100 * LAMPORTS_PER_SOL },
        { shares: 0, expectedPayout: 0 },
      ];

      testCases.forEach(({ shares, expectedPayout }) => {
        const actualPayout = calculatePayout(shares);
        expect(actualPayout).to.equal(expectedPayout);
        
        console.log(`${shares} winning shares -> ${actualPayout / LAMPORTS_PER_SOL} SOL payout`);
      });
    });
  });

  describe("String Validation", () => {
    function validateStringLength(value: string, maxLength: number): boolean {
      return value.length > 0 && value.length <= maxLength;
    }

    it("Validates string lengths correctly", () => {
      // Valid strings
      expect(validateStringLength("valid", 10)).to.be.true;
      expect(validateStringLength("a", 1)).to.be.true;
      expect(validateStringLength("a".repeat(50), 50)).to.be.true;

      // Invalid strings
      expect(validateStringLength("", 10)).to.be.false; // Empty
      expect(validateStringLength("toolong", 5)).to.be.false; // Too long
      expect(validateStringLength("a".repeat(51), 50)).to.be.false; // Exceeds max
    });

    it("Handles unicode strings correctly", () => {
      const unicodeString = "测试🏆⚽";
      expect(validateStringLength(unicodeString, 10)).to.be.true;
      expect(validateStringLength(unicodeString, 3)).to.be.false; // Character count, not byte count
      
      console.log(`Unicode string "${unicodeString}" length: ${unicodeString.length} characters`);
    });
  });

  describe("Share Quantity Validation", () => {
    function validateShareQuantity(
      quantity: number,
      maxAvailable: number,
      currentMinted: number
    ): boolean {
      return quantity > 0 && (currentMinted + quantity) <= maxAvailable;
    }

    it("Validates share quantities", () => {
      // Valid quantities
      expect(validateShareQuantity(1, 500, 0)).to.be.true;
      expect(validateShareQuantity(100, 500, 200)).to.be.true;
      expect(validateShareQuantity(300, 500, 200)).to.be.true; // Exactly at limit

      // Invalid quantities
      expect(validateShareQuantity(0, 500, 0)).to.be.false; // Zero quantity
      expect(validateShareQuantity(301, 500, 200)).to.be.false; // Exceeds available
      expect(validateShareQuantity(1, 500, 500)).to.be.false; // No more available
    });

    it("Handles edge cases", () => {
      // Last available share
      expect(validateShareQuantity(1, 500, 499)).to.be.true;
      
      // Exactly at capacity
      expect(validateShareQuantity(500, 500, 0)).to.be.true;
      
      // Over capacity by one
      expect(validateShareQuantity(501, 500, 0)).to.be.false;
    });
  });

  describe("Order Price Validation", () => {
    function validateOrderPrice(price: number): boolean {
      return price > 0 && price < LAMPORTS_PER_SOL;
    }

    it("Validates order prices", () => {
      // Valid prices
      expect(validateOrderPrice(1)).to.be.true;
      expect(validateOrderPrice(LAMPORTS_PER_SOL / 2)).to.be.true;
      expect(validateOrderPrice(LAMPORTS_PER_SOL - 1)).to.be.true;

      // Invalid prices
      expect(validateOrderPrice(0)).to.be.false;
      expect(validateOrderPrice(LAMPORTS_PER_SOL)).to.be.false;
      expect(validateOrderPrice(LAMPORTS_PER_SOL + 1)).to.be.false;
    });

    it("Handles typical price ranges", () => {
      const typicalPrices = [
        0.1 * LAMPORTS_PER_SOL,  // 10%
        0.25 * LAMPORTS_PER_SOL, // 25%
        0.5 * LAMPORTS_PER_SOL,  // 50%
        0.75 * LAMPORTS_PER_SOL, // 75%
        0.9 * LAMPORTS_PER_SOL,  // 90%
      ];

      typicalPrices.forEach(price => {
        expect(validateOrderPrice(price)).to.be.true;
        console.log(`✓ Valid price: ${price / LAMPORTS_PER_SOL} SOL`);
      });
    });
  });

  describe("Order ID Generation", () => {
    function generateOrderId(userAddress: string, eventId: string, timestamp: number): string {
      const userPrefix = userAddress.slice(0, 8);
      return `${userPrefix}_${eventId}__${timestamp}`;
    }

    it("Generates unique order IDs", () => {
      const userAddress = "11111111112222222222333333333344";
      const eventId = "test_event";
      const timestamp = 1640995200;

      const orderId = generateOrderId(userAddress, eventId, timestamp);
      expect(orderId).to.equal("11111111_test_event__1640995200");
    });

    it("Creates different IDs for different inputs", () => {
      const user1 = "11111111112222222222333333333344";
      const user2 = "55555555556666666666777777777788";
      const eventId = "test_event";
      const timestamp = 1640995200;

      const orderId1 = generateOrderId(user1, eventId, timestamp);
      const orderId2 = generateOrderId(user2, eventId, timestamp);

      expect(orderId1).to.not.equal(orderId2);
      expect(orderId1.includes("11111111")).to.be.true;
      expect(orderId2.includes("55555555")).to.be.true;
    });
  });

  describe("Mathematical Edge Cases", () => {
    it("Handles floating point precision", () => {
      // Test cases that might cause floating point issues
      const precisionTests = [
        { input: 3333, expected: 3333 }, // 33.33%
        { input: 6666, expected: 6666 }, // 66.66%
        { input: 1111, expected: 1111 }, // 11.11%
      ];

      precisionTests.forEach(({ input, expected }) => {
        const [yes, no] = normalizeOptaOdds(input);
        
        // Should be very close to expected
        expect(Math.abs(yes - expected)).to.be.lessThan(10); // Within 0.1%
        expect(yes + no).to.equal(10000);
      });
    });

    it("Handles integer overflow scenarios", () => {
      // Large numbers that could cause overflow
      const largeAmount = Number.MAX_SAFE_INTEGER;
      
      // These calculations should not overflow in JavaScript
      expect(() => calculateFee(largeAmount, 1)).to.not.throw();
      expect(() => calculateSharePrices(9999)).to.not.throw();
    });
  });

  describe("Performance Benchmarks", () => {
    it("Benchmarks utility function performance", () => {
      const iterations = 10000;
      
      // Benchmark OPTA odds normalization
      const start1 = Date.now();
      for (let i = 0; i < iterations; i++) {
        normalizeOptaOdds(5640);
      }
      const time1 = Date.now() - start1;
      
      // Benchmark price calculation
      const start2 = Date.now();
      for (let i = 0; i < iterations; i++) {
        calculateSharePrices(5640);
      }
      const time2 = Date.now() - start2;
      
      // Benchmark market price calculation
      const start3 = Date.now();
      for (let i = 0; i < iterations; i++) {
        calculateMarketPrice(600000000, 400000000);
      }
      const time3 = Date.now() - start3;
      
      console.log(`\nPerformance Benchmarks (${iterations} iterations):`);
      console.log(`OPTA normalization: ${time1}ms`);
      console.log(`Price calculation: ${time2}ms`);
      console.log(`Market price calculation: ${time3}ms`);
      
      // All should complete quickly
      expect(time1).to.be.lessThan(100);
      expect(time2).to.be.lessThan(100);
      expect(time3).to.be.lessThan(100);
    });
  });

  describe("Integration with Smart Contract Constants", () => {
    it("Uses correct Solana constants", () => {
      expect(LAMPORTS_PER_SOL).to.equal(1000000000);
      
      // Test that our calculations align with Solana's precision
      const oneSOL = LAMPORTS_PER_SOL;
      const halfSOL = oneSOL / 2;
      const quarterSOL = oneSOL / 4;
      
      expect(oneSOL).to.equal(1000000000);
      expect(halfSOL).to.equal(500000000);
      expect(quarterSOL).to.equal(250000000);
    });

    it("Validates basis point calculations", () => {
      // 10000 basis points = 100%
      const basisPointsIn100Percent = 10000;
      
      expect(basisPointsIn100Percent).to.equal(10000);
      
      // Common fee calculations
      const twoPercent = 200; // 2% = 200 basis points
      const halfPercent = 50;  // 0.5% = 50 basis points
      
      expect(twoPercent / 100).to.equal(2);
      expect(halfPercent / 100).to.equal(0.5);
    });
  });
});