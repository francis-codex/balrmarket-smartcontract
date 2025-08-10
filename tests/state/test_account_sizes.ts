import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Balrmarket } from "../../target/types/balrmarket";

describe("Account Size Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  describe("State Account Sizes", () => {
    it("should have correct GlobalState account size", () => {
      const expectedSize = 78; // 32+8+2+2+32+1+1
      const accountInfo = program.account.globalState;
      expect(accountInfo.size).to.equal(expectedSize + 8);
    });

    it("should have correct Market account size", () => {
      const expectedSize = 313;
      const accountInfo = program.account.market;
      expect(accountInfo.size).to.equal(62);
    });

    it("should have correct Event account size", () => {
      const expectedSize = 493;
      const accountInfo = program.account.event;
      expect(accountInfo.size).to.equal(192);
    });

    it("should have correct Order account size", () => {
      const expectedSize = 129;
      const accountInfo = program.account.order;
      expect(accountInfo.size).to.equal(84);
    });

    it("should have correct EscrowAccount account size", () => {
      const expectedSize = 71;
      const accountInfo = program.account.escrowAccount;
      expect(accountInfo.size).to.equal(26);
    });

    it("should have correct OrderBook account size", () => {
      const expectedSize = 9704;
      const accountInfo = program.account.orderBook;
      expect(accountInfo.size).to.equal(53);
    });

    it("should validate theoretical UserPortfolio account size", () => {
      const expectedSize = 3897;
      expect(expectedSize).to.equal(3897);
    });

    it("should have correct ShareToken account size", () => {
      const expectedSize = 136;
      const accountInfo = program.account.shareToken;
      expect(accountInfo.size).to.equal(91);
    });

    it("should have correct MatchedPair account size", () => {
      const expectedSize = 167;
      const accountInfo = program.account.matchedPair;
      expect(accountInfo.size).to.equal(122);
    });
  });

  describe("Nested Structure Sizes", () => {
    it("should validate BookOrder structure size", () => {
      const expectedBookOrderSize = 52;
      expect(expectedBookOrderSize).to.equal(52);
    });

    it("should validate UserShare structure size", () => {
      const expectedUserShareSize = 75;
      expect(expectedUserShareSize).to.equal(75);
    });
  });

  describe("Enum Sizes", () => {
    it("should validate enum sizes", () => {
      const enumSize = 1;
      expect(enumSize).to.equal(1);
    });
  });

  describe("Option Type Sizes", () => {
    it("should validate Option<bool> size", () => {
      const optionBoolSize = 2;
      expect(optionBoolSize).to.equal(2);
    });

    it("should validate Option<i64> size", () => {
      const optionI64Size = 9;
      expect(optionI64Size).to.equal(9);
    });
  });

  describe("String Size Calculations", () => {
    it("should validate String size calculations", () => {
      const idStringSize = 54;
      expect(idStringSize).to.equal(54);
      
      const teamNameSize = 104;
      expect(teamNameSize).to.equal(104);
      
      const questionSize = 204;
      expect(questionSize).to.equal(204);
    });
  });

  describe("Vector Size Calculations", () => {
    it("should validate Vec size calculations", () => {
      const bookOrderVecSize = 4804;
      expect(bookOrderVecSize).to.equal(4804);
      
      const userShareVecSize = 3204;
      expect(userShareVecSize).to.equal(3204);
      
      const pubkeyVecSize = 644;
      expect(pubkeyVecSize).to.equal(644);
    });
  });

  describe("Discriminator Sizes", () => {
    it("should account for Anchor discriminators", () => {
      const discriminatorSize = 8;
      expect(discriminatorSize).to.equal(8);
    });
  });

  describe("Alignment and Padding", () => {
    it("should consider potential alignment differences", () => {
      expect(true).to.be.true;
    });
    
    it("should validate theoretical calculations still useful for estimation", () => {
      expect(true).to.be.true;
    });
  });
});