# BALR Market Frontend Integration: Admin Hierarchy Migration Guide

## 🚨 Critical Migration Required

The BALR Market Solana program has been enhanced with a **hierarchical admin system** that introduces breaking changes for frontend applications. This document provides a comprehensive guide for updating your frontend to work with the new admin hierarchy system.

## Table of Contents

- [Overview of Changes](#overview-of-changes)
- [Breaking Changes](#breaking-changes)
- [Admin Hierarchy System](#admin-hierarchy-system)
- [New Instructions](#new-instructions)
- [Updated Instructions](#updated-instructions)
- [Frontend Migration Steps](#frontend-migration-steps)
- [Code Examples](#code-examples)
- [Error Handling](#error-handling)
- [Testing Guidelines](#testing-guidelines)

## Overview of Changes

### Before (Old System)
- Single admin stored in `GlobalState.admin`
- Admin validation through direct pubkey comparison
- Only one administrator per program instance

### After (New System)
- **Hierarchical admin system** with two levels:
  - **Super Admins** (max 3): Full system control including admin management
  - **Regular Admins** (unlimited): Operational permissions only
- Admin validation through `AdminHierarchy` PDA
- **Dual system**: Both old and new admin systems coexist

## Breaking Changes

### ⚠️ All Admin-Required Instructions Now Need Admin Hierarchy Account

The following instructions now **require** the `admin_hierarchy` account:

1. `create_market`
2. `create_event`
3. `end_primary_market`
4. `collect_platform_fees`

### ⚠️ New Error Codes

Your frontend must handle new admin-specific error codes (6100-6199 range):

```typescript
export enum AdminErrorCode {
  MaxSuperAdminsExceeded = 6100,
  CannotRemoveLastSuperAdmin = 6101,
  AdminAlreadyExists = 6102,
  AdminNotFound = 6103,
  InsufficientAdminPrivileges = 6104,
  RegularAdminUnauthorized = 6105,
  SuperAdminRequired = 6106,
}
```

## Admin Hierarchy System

### System Architecture

```typescript
interface AdminHierarchy {
  superAdmins: PublicKey[];      // Max 3 super admins
  regularAdmins: PublicKey[];    // Unlimited regular admins
  bump: number;                  // PDA bump seed
}
```

### PDA Derivation

```typescript
// Admin Hierarchy PDA
const [adminHierarchyPda, adminHierarchyBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("admin_hierarchy")],
  program.programId
);
```

### Admin Roles & Permissions

| Operation | Super Admin | Regular Admin |
|-----------|-------------|---------------|
| Add/Remove Super Admins | ✅ | ❌ |
| Add/Remove Regular Admins | ✅ | ❌ |
| Promote/Demote Admins | ✅ | ❌ |
| Create Markets | ✅ | ✅ |
| Create Events | ✅ | ✅ |
| End Primary Markets | ✅ | ✅ |
| Collect Platform Fees | ✅ | ✅ |

## New Instructions

### 1. Initialize Admin Hierarchy (Required Setup)

```typescript
// Must be called after initialize_global_state
await program.methods
  .initializeAdminHierarchy()
  .accounts({
    adminHierarchy: adminHierarchyPda,
    initialSuperAdmin: adminWallet.publicKey,
    payer: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([adminWallet])
  .rpc();
```

### 2. Add Super Admin

```typescript
await program.methods
  .addSuperAdmin(newSuperAdminPubkey)
  .accounts({
    adminHierarchy: adminHierarchyPda,
    superAdmin: currentSuperAdminWallet.publicKey,
  })
  .signers([currentSuperAdminWallet])
  .rpc();
```

### 3. Add Regular Admin

```typescript
await program.methods
  .addRegularAdmin(newRegularAdminPubkey)
  .accounts({
    adminHierarchy: adminHierarchyPda,
    superAdmin: superAdminWallet.publicKey,
  })
  .signers([superAdminWallet])
  .rpc();
```

### 4. Get Admin Information

```typescript
const adminInfo = await program.methods
  .getAdminInfo()
  .accounts({
    adminHierarchy: adminHierarchyPda,
  })
  .view();

console.log("Super Admins:", adminInfo.superAdmins);
console.log("Regular Admins:", adminInfo.regularAdmins);
console.log("Super Admin Count:", adminInfo.superAdminCount);
console.log("Regular Admin Count:", adminInfo.regularAdminCount);
```

### 5. Remove/Promote/Demote Admins

```typescript
// Remove Super Admin (Super Admin only)
await program.methods
  .removeSuperAdmin(adminToRemovePubkey)
  .accounts({
    adminHierarchy: adminHierarchyPda,
    superAdmin: superAdminWallet.publicKey,
  })
  .rpc();

// Promote Regular Admin to Super Admin
await program.methods
  .promoteAdmin(adminToPromotePubkey)
  .accounts({
    adminHierarchy: adminHierarchyPda,
    superAdmin: superAdminWallet.publicKey,
  })
  .rpc();

// Demote Super Admin to Regular Admin
await program.methods
  .demoteSuperAdmin(adminToDemotePubkey)
  .accounts({
    adminHierarchy: adminHierarchyPda,
    superAdmin: superAdminWallet.publicKey,
  })
  .rpc();
```

## Updated Instructions

### Before vs After Comparison

#### Create Market (UPDATED)

**Before:**
```typescript
await program.methods
  .createMarket(marketId, teamA, teamB, matchTimestamp)
  .accounts({
    globalState: globalStatePda,
    market: marketPda,
    admin: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

**After:**
```typescript
await program.methods
  .createMarket(marketId, teamA, teamB, matchTimestamp)
  .accounts({
    globalState: globalStatePda,
    adminHierarchy: adminHierarchyPda,  // 🆕 REQUIRED
    market: marketPda,
    admin: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### Create Event (UPDATED)

**Before:**
```typescript
await program.methods
  .createEvent(eventId, /* other params */)
  .accounts({
    globalState: globalStatePda,
    market: marketPda,
    event: eventPda,
    admin: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

**After:**
```typescript
await program.methods
  .createEvent(eventId, /* other params */)
  .accounts({
    globalState: globalStatePda,
    adminHierarchy: adminHierarchyPda,  // 🆕 REQUIRED
    market: marketPda,
    event: eventPda,
    admin: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

#### End Primary Market (UPDATED)

**After:**
```typescript
await program.methods
  .endPrimaryMarket()
  .accounts({
    globalState: globalStatePda,
    adminHierarchy: adminHierarchyPda,  // 🆕 REQUIRED
    event: eventPda,
    admin: adminWallet.publicKey,
  })
  .rpc();
```

#### Collect Platform Fees (UPDATED)

**After:**
```typescript
await program.methods
  .collectPlatformFees()
  .accounts({
    globalState: globalStatePda,
    adminHierarchy: adminHierarchyPda,  // 🆕 REQUIRED
    admin: adminWallet.publicKey,
    adminWallet: adminWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Frontend Migration Steps

### Step 1: Update Initialization Flow

Your application setup must now include admin hierarchy initialization:

```typescript
class BalrMarketClient {
  private program: Program<Balrmarket>;
  private adminHierarchyPda: PublicKey;

  async initialize() {
    // 1. Initialize global state (existing)
    await this.initializeGlobalState();

    // 2. Initialize admin hierarchy (NEW)
    await this.initializeAdminHierarchy();

    // 3. Setup additional admins if needed (NEW)
    await this.setupAdditionalAdmins();
  }

  private async initializeAdminHierarchy() {
    try {
      // Check if already initialized
      await this.program.account.adminHierarchy.fetch(this.adminHierarchyPda);
      console.log("Admin hierarchy already initialized");
    } catch (error) {
      // Initialize if not exists
      await this.program.methods
        .initializeAdminHierarchy()
        .accounts({
          adminHierarchy: this.adminHierarchyPda,
          initialSuperAdmin: this.adminWallet.publicKey,
          payer: this.adminWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Admin hierarchy initialized");
    }
  }
}
```

### Step 2: Update All Admin Operations

Create wrapper functions that include admin hierarchy:

```typescript
class BalrMarketClient {
  async createMarket(marketId: string, teamA: string, teamB: string, timestamp: number) {
    // Validate admin permissions first
    await this.validateAdminPermissions();

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(marketId)],
      this.program.programId
    );

    return await this.program.methods
      .createMarket(marketId, teamA, teamB, new BN(timestamp))
      .accounts({
        globalState: this.globalStatePda,
        adminHierarchy: this.adminHierarchyPda,  // Always include
        market: marketPda,
        admin: this.adminWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  private async validateAdminPermissions() {
    const adminInfo = await this.getAdminInfo();
    const isAdmin = adminInfo.superAdmins.some(admin =>
      admin.equals(this.adminWallet.publicKey)
    ) || adminInfo.regularAdmins.some(admin =>
      admin.equals(this.adminWallet.publicKey)
    );

    if (!isAdmin) {
      throw new Error("Current wallet is not an admin");
    }
  }
}
```

### Step 3: Add Admin Management Functions

```typescript
class BalrMarketClient {
  async getAdminInfo() {
    return await this.program.methods
      .getAdminInfo()
      .accounts({
        adminHierarchy: this.adminHierarchyPda,
      })
      .view();
  }

  async addSuperAdmin(newSuperAdmin: PublicKey) {
    await this.validateSuperAdminPermissions();

    return await this.program.methods
      .addSuperAdmin(newSuperAdmin)
      .accounts({
        adminHierarchy: this.adminHierarchyPda,
        superAdmin: this.adminWallet.publicKey,
      })
      .rpc();
  }

  async addRegularAdmin(newRegularAdmin: PublicKey) {
    await this.validateSuperAdminPermissions();

    return await this.program.methods
      .addRegularAdmin(newRegularAdmin)
      .accounts({
        adminHierarchy: this.adminHierarchyPda,
        superAdmin: this.adminWallet.publicKey,
      })
      .rpc();
  }

  private async validateSuperAdminPermissions() {
    const adminInfo = await this.getAdminInfo();
    const isSuperAdmin = adminInfo.superAdmins.some(admin =>
      admin.equals(this.adminWallet.publicKey)
    );

    if (!isSuperAdmin) {
      throw new Error("Super admin privileges required");
    }
  }
}
```

## Error Handling

### Enhanced Error Handler

```typescript
function handleAdminError(error: any) {
  if (error.code) {
    switch (error.code) {
      case 6100:
        return "Maximum number of super admins (3) exceeded";
      case 6101:
        return "Cannot remove the last super admin";
      case 6102:
        return "Admin already exists in the system";
      case 6103:
        return "Admin not found";
      case 6104:
        return "Insufficient admin privileges";
      case 6105:
        return "Regular admin unauthorized for this operation";
      case 6106:
        return "Super admin privileges required";
      default:
        return `Unknown admin error: ${error.code}`;
    }
  }
  return error.message || "Unknown error";
}

// Usage
try {
  await client.addSuperAdmin(newAdminPubkey);
} catch (error) {
  console.error(handleAdminError(error));
}
```

## Testing Guidelines

### Test Environment Setup

```typescript
describe("Admin Hierarchy Migration Tests", () => {
  let program: Program<Balrmarket>;
  let adminHierarchyPda: PublicKey;

  beforeEach(async () => {
    // Setup test environment
    const provider = AnchorProvider.env();
    const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

    [adminHierarchyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_hierarchy")],
      program.programId
    );
  });

  it("should initialize admin hierarchy", async () => {
    await program.methods
      .initializeAdminHierarchy()
      .accounts({
        adminHierarchy: adminHierarchyPda,
        initialSuperAdmin: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const adminInfo = await program.methods
      .getAdminInfo()
      .accounts({ adminHierarchy: adminHierarchyPda })
      .view();

    expect(adminInfo.superAdminCount).to.equal(1);
    expect(adminInfo.superAdmins[0].equals(provider.wallet.publicKey)).to.be.true;
  });

  it("should create market with admin hierarchy", async () => {
    // Test updated market creation
    await program.methods
      .createMarket("test-market", "Team A", "Team B", new BN(Date.now()))
      .accounts({
        globalState: globalStatePda,
        adminHierarchy: adminHierarchyPda,  // Required account
        market: marketPda,
        admin: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });
});
```

### Migration Testing Checklist

- [ ] Admin hierarchy initializes correctly
- [ ] Existing admin can create markets/events with new account structure
- [ ] Super admin can add/remove other admins
- [ ] Regular admin cannot perform admin management operations
- [ ] Error codes are handled properly
- [ ] All legacy operations work with admin hierarchy account included

## Deployment Checklist

### Before Deploying to Production

1. **Test Admin Hierarchy Initialization**
   - [ ] Initialize admin hierarchy on devnet
   - [ ] Add test super admins
   - [ ] Add test regular admins
   - [ ] Verify all operations work

2. **Update Frontend Code**
   - [ ] Update all admin-required instruction calls
   - [ ] Add admin hierarchy PDA derivation
   - [ ] Update error handling
   - [ ] Add admin management UI components

3. **Database/State Management**
   - [ ] Update admin state management
   - [ ] Cache admin hierarchy information
   - [ ] Implement admin role checking

4. **User Interface Updates**
   - [ ] Admin dashboard with hierarchy management
   - [ ] Role-based UI rendering
   - [ ] Admin status indicators

### Production Migration Steps

1. **Deploy Updated Program** (if needed)
2. **Initialize Admin Hierarchy**
   ```bash
   # Run the admin hierarchy initialization
   ts-node client/add-super-admins.ts
   ```
3. **Update Frontend Deployment**
4. **Test All Admin Operations**
5. **Monitor for Errors**

## Support and Troubleshooting

### Common Issues

1. **"Account not found" for admin hierarchy**
   - **Solution**: Initialize admin hierarchy first

2. **"Insufficient admin privileges" errors**
   - **Solution**: Check if wallet is added as admin in hierarchy

3. **"Super admin required" errors**
   - **Solution**: Use super admin wallet for admin management operations

### Debug Commands

```typescript
// Check if admin hierarchy is initialized
try {
  const adminInfo = await program.account.adminHierarchy.fetch(adminHierarchyPda);
  console.log("Admin hierarchy exists:", adminInfo);
} catch (error) {
  console.log("Admin hierarchy not initialized");
}

// Check admin role for wallet
const adminInfo = await program.methods.getAdminInfo()
  .accounts({ adminHierarchy: adminHierarchyPda })
  .view();

const isSuperAdmin = adminInfo.superAdmins.some(admin =>
  admin.equals(walletPubkey)
);
const isRegularAdmin = adminInfo.regularAdmins.some(admin =>
  admin.equals(walletPubkey)
);

console.log(`Wallet ${walletPubkey} - Super Admin: ${isSuperAdmin}, Regular Admin: ${isRegularAdmin}`);
```

---

## Summary

The admin hierarchy system provides robust multi-admin management while maintaining backward compatibility. The key requirement is **including the `admin_hierarchy` account in all admin-required operations** and **initializing the admin hierarchy after global state setup**.

This migration enables:
- ✅ Multiple administrators with role-based permissions
- ✅ Secure admin management operations
- ✅ Scalable admin hierarchy (up to 3 super admins, unlimited regular admins)
- ✅ Backward compatibility with existing global state