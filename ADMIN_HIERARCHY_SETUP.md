# BALR Market Hierarchical Admin System - Complete Setup Guide

The BALR Market smart contract implements a two-tier hierarchical admin system:
- **Super Admins (Max 3)**: Full system control including admin management
- **Regular Admins (Unlimited)**: Standard administrative privileges excluding admin management

This guide provides complete instructions for deploying and managing the admin hierarchy system.

---

## **File Locations**

### **Smart Contract Files**
```
programs/balrmarket/src/
├── instructions/
│   ├── initialize_admin_hierarchy.rs    # Initialize admin system
│   ├── add_super_admin.rs               # Add super admin
│   ├── remove_super_admin.rs            # Remove super admin
│   ├── add_regular_admin.rs             # Add regular admin
│   ├── remove_regular_admin.rs          # Remove regular admin
│   ├── promote_admin.rs                 # Promote regular to super
│   ├── demote_super_admin.rs            # Demote super to regular
│   └── get_admin_info.rs                # View admin information
├── state/
│   └── admin_hierarchy.rs               # Admin state structure
├── error.rs                             # Error codes (6100-6199)
├── events.rs                            # Admin events
└── lib.rs                               # Main program file
```

### **Client/Frontend Files**
```
client/
├── admin-setup.ts                      # Admin management script
├── types/                               # TypeScript types
└── utils/
    └── admin-helpers.ts                 # Helper functions
```

---

## **Step 1: Deploy the Smart Contract**

### **Build and Deploy**
```bash
# Navigate to project directory
cd /Users/franciscodex/balrmarket-smartcontract

# Build the program
anchor build

# Deploy to devnet (or your chosen network)
anchor deploy --provider.cluster devnet

# Note: Save the Program ID that gets output
# Example: CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq
```

### **Update Program ID**
Update the program ID in:
- `Anchor.toml`
- `programs/balrmarket/src/lib.rs` (line 18)
- Your client code

---

## **Step 2: Create Admin Management Script**

Create `client/admin-setup.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Balrmarket } from "../target/types/balrmarket";

// Initialize Anchor provider
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

// Admin hierarchy PDA
const [adminHierarchyPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("admin_hierarchy")],
  program.programId
);

export class AdminManager {
  
  /**
   * Step 1: Initialize the admin hierarchy system (run once)
   */
  static async initializeAdminHierarchy(initialSuperAdmin: Keypair) {
    console.log("🔧 Initializing admin hierarchy...");
    
    try {
      const tx = await program.methods
        .initializeAdminHierarchy()
        .accounts({
          adminHierarchy: adminHierarchyPda,
          initialSuperAdmin: initialSuperAdmin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([initialSuperAdmin])
        .rpc();
      
      console.log("✅ Admin hierarchy initialized!");
      console.log("📝 Transaction:", tx);
      console.log("👑 Initial Super Admin:", initialSuperAdmin.publicKey.toString());
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to initialize admin hierarchy:", error);
      throw error;
    }
  }

  /**
   * Add a new super admin (max 3 total)
   */
  static async addSuperAdmin(
    currentSuperAdmin: Keypair, 
    newSuperAdminPubkey: PublicKey
  ) {
    console.log("👑 Adding super admin...");
    
    try {
      const tx = await program.methods
        .addSuperAdmin(newSuperAdminPubkey)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: currentSuperAdmin.publicKey,
        })
        .signers([currentSuperAdmin])
        .rpc();
      
      console.log("✅ Super admin added!");
      console.log("📝 Transaction:", tx);
      console.log("👑 New Super Admin:", newSuperAdminPubkey.toString());
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to add super admin:", error);
      throw error;
    }
  }

  /**
   * Add a new regular admin (unlimited)
   */
  static async addRegularAdmin(
    superAdmin: Keypair, 
    newRegularAdminPubkey: PublicKey
  ) {
    console.log("👤 Adding regular admin...");
    
    try {
      const tx = await program.methods
        .addRegularAdmin(newRegularAdminPubkey)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: superAdmin.publicKey,
        })
        .signers([superAdmin])
        .rpc();
      
      console.log("✅ Regular admin added!");
      console.log("📝 Transaction:", tx);
      console.log("👤 New Regular Admin:", newRegularAdminPubkey.toString());
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to add regular admin:", error);
      throw error;
    }
  }

  /**
   * Remove a super admin
   */
  static async removeSuperAdmin(
    currentSuperAdmin: Keypair, 
    adminToRemove: PublicKey
  ) {
    console.log("🗑️ Removing super admin...");
    
    try {
      const tx = await program.methods
        .removeSuperAdmin(adminToRemove)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: currentSuperAdmin.publicKey,
        })
        .signers([currentSuperAdmin])
        .rpc();
      
      console.log("✅ Super admin removed!");
      console.log("📝 Transaction:", tx);
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to remove super admin:", error);
      throw error;
    }
  }

  /**
   * Remove a regular admin
   */
  static async removeRegularAdmin(
    superAdmin: Keypair, 
    adminToRemove: PublicKey
  ) {
    console.log("🗑️ Removing regular admin...");
    
    try {
      const tx = await program.methods
        .removeRegularAdmin(adminToRemove)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: superAdmin.publicKey,
        })
        .signers([superAdmin])
        .rpc();
      
      console.log("✅ Regular admin removed!");
      console.log("📝 Transaction:", tx);
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to remove regular admin:", error);
      throw error;
    }
  }

  /**
   * Promote regular admin to super admin
   */
  static async promoteAdmin(
    superAdmin: Keypair, 
    adminToPromote: PublicKey
  ) {
    console.log("⬆️ Promoting admin...");
    
    try {
      const tx = await program.methods
        .promoteAdmin(adminToPromote)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: superAdmin.publicKey,
        })
        .signers([superAdmin])
        .rpc();
      
      console.log("✅ Admin promoted to super admin!");
      console.log("📝 Transaction:", tx);
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to promote admin:", error);
      throw error;
    }
  }

  /**
   * Demote super admin to regular admin
   */
  static async demoteSuperAdmin(
    superAdmin: Keypair, 
    adminToDemote: PublicKey
  ) {
    console.log("⬇️ Demoting super admin...");
    
    try {
      const tx = await program.methods
        .demoteSuperAdmin(adminToDemote)
        .accounts({
          adminHierarchy: adminHierarchyPda,
          superAdmin: superAdmin.publicKey,
        })
        .signers([superAdmin])
        .rpc();
      
      console.log("✅ Super admin demoted to regular admin!");
      console.log("📝 Transaction:", tx);
      
      return tx;
    } catch (error) {
      console.error("❌ Failed to demote super admin:", error);
      throw error;
    }
  }

  /**
   * Get current admin information
   */
  static async getAdminInfo() {
    console.log("📊 Fetching admin information...");
    
    try {
      const adminInfo = await program.methods
        .getAdminInfo()
        .accounts({
          adminHierarchy: adminHierarchyPda,
        })
        .view();
      
      console.log("📊 Admin Information:");
      console.log("👑 Super Admins:", adminInfo.superAdmins.map(pk => pk.toString()));
      console.log("👤 Regular Admins:", adminInfo.regularAdmins.map(pk => pk.toString()));
      console.log("📈 Super Admin Count:", adminInfo.superAdminCount);
      console.log("📈 Regular Admin Count:", adminInfo.regularAdminCount);
      console.log("🔢 Max Super Admins:", adminInfo.maxSuperAdmins);
      
      return adminInfo;
    } catch (error) {
      console.error("❌ Failed to get admin info:", error);
      throw error;
    }
  }

  /**
   * Check if a public key is a super admin
   */
  static async isSuperAdmin(pubkey: PublicKey): Promise<boolean> {
    const adminInfo = await this.getAdminInfo();
    return adminInfo.superAdmins.some(admin => admin.equals(pubkey));
  }

  /**
   * Check if a public key is a regular admin
   */
  static async isRegularAdmin(pubkey: PublicKey): Promise<boolean> {
    const adminInfo = await this.getAdminInfo();
    return adminInfo.regularAdmins.some(admin => admin.equals(pubkey));
  }

  /**
   * Check if a public key is any type of admin
   */
  static async isAnyAdmin(pubkey: PublicKey): Promise<boolean> {
    return (await this.isSuperAdmin(pubkey)) || (await this.isRegularAdmin(pubkey));
  }
}

// Example usage function
export async function setupInitialAdmins() {
  // This would be your initial deployer keypair
  const deployerKeypair = Keypair.generate(); // Replace with actual keypair
  
  console.log("🚀 Setting up initial admin hierarchy...");
  
  try {
    // Step 1: Initialize the system
    await AdminManager.initializeAdminHierarchy(deployerKeypair);
    
    // Step 2: Add additional super admins (optional)
    const frontendAdminKeypair = Keypair.generate(); // Replace with actual
    const integrationAdminKeypair = Keypair.generate(); // Replace with actual
    
    await AdminManager.addSuperAdmin(deployerKeypair, frontendAdminKeypair.publicKey);
    await AdminManager.addSuperAdmin(deployerKeypair, integrationAdminKeypair.publicKey);
    
    // Step 3: Add regular admins
    const marketOperatorKeypair = Keypair.generate(); // Replace with actual
    const customerSupportKeypair = Keypair.generate(); // Replace with actual
    
    await AdminManager.addRegularAdmin(deployerKeypair, marketOperatorKeypair.publicKey);
    await AdminManager.addRegularAdmin(deployerKeypair, customerSupportKeypair.publicKey);
    
    // Step 4: Verify setup
    await AdminManager.getAdminInfo();
    
    console.log("🎉 Admin hierarchy setup complete!");
    
  } catch (error) {
    console.error("💥 Setup failed:", error);
  }
}
```

---

## **Step 3: Setup Script Execution**

Create `scripts/setup-admins.ts`:

```typescript
#!/usr/bin/env ts-node

import { AdminManager, setupInitialAdmins } from "../client/admin-setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case "init":
      await initializeSystem();
      break;
    case "add-super":
      await addSuperAdmin();
      break;
    case "add-regular":
      await addRegularAdmin();
      break;
    case "info":
      await AdminManager.getAdminInfo();
      break;
    case "setup":
      await setupInitialAdmins();
      break;
    default:
      console.log(`
Usage: ts-node scripts/setup-admins.ts <command>

Commands:
  init          Initialize admin hierarchy
  add-super     Add a super admin
  add-regular   Add a regular admin
  info          Show current admin info
  setup         Complete initial setup
      `);
  }
}

async function initializeSystem() {
  // Load your deployer keypair
  const deployerKeypair = loadKeypair("~/.config/solana/id.json");
  await AdminManager.initializeAdminHierarchy(deployerKeypair);
}

async function addSuperAdmin() {
  const superAdminKeypair = loadKeypair("~/.config/solana/id.json");
  const newAdminPubkey = new PublicKey(process.argv[3]);
  await AdminManager.addSuperAdmin(superAdminKeypair, newAdminPubkey);
}

async function addRegularAdmin() {
  const superAdminKeypair = loadKeypair("~/.config/solana/id.json");
  const newAdminPubkey = new PublicKey(process.argv[3]);
  await AdminManager.addRegularAdmin(superAdminKeypair, newAdminPubkey);
}

function loadKeypair(path: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

main().catch(console.error);
```

---

## **Step 4: Command Execution**

### **Initialize the System**
```bash
# Make sure you're in the project directory
cd /Users/franciscodex/balrmarket-smartcontract

# Install dependencies
npm install

# Initialize the admin hierarchy (run ONCE after deployment)
npx ts-node scripts/setup-admins.ts init
```

### **Add Super Admins** (Max 3 total)
```bash
# Add a super admin
npx ts-node scripts/setup-admins.ts add-super <NEW_SUPER_ADMIN_PUBKEY>

# Example:
npx ts-node scripts/setup-admins.ts add-super 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

### **Add Regular Admins** (Unlimited)
```bash
# Add a regular admin
npx ts-node scripts/setup-admins.ts add-regular <NEW_REGULAR_ADMIN_PUBKEY>

# Example:
npx ts-node scripts/setup-admins.ts add-regular 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
```

### **View Current Admin Status**
```bash
# Show all current admins
npx ts-node scripts/setup-admins.ts info
```

### **Complete Initial Setup**
```bash
# Run the complete setup (modify keypairs in the script first)
npx ts-node scripts/setup-admins.ts setup
```

---

## **Step 5: Anchor.toml Configuration**

Add these scripts to your `Anchor.toml`:

```toml
[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
initialize-admin-hierarchy = "npx ts-node scripts/setup-admins.ts init"
add-super-admin = "npx ts-node scripts/setup-admins.ts add-super"
add-regular-admin = "npx ts-node scripts/setup-admins.ts add-regular"
admin-info = "npx ts-node scripts/setup-admins.ts info"
setup-admins = "npx ts-node scripts/setup-admins.ts setup"

[[test.genesis]]
address = "CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq"
program = "target/deploy/balrmarket.so"
```

Then you can run:
```bash
anchor run initialize-admin-hierarchy
anchor run admin-info
```

---

## **Step 6: Environment Setup**

Create `.env` file:
```bash
# Network configuration
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
ANCHOR_WALLET=~/.config/solana/id.json

# Program ID (update after deployment)
PROGRAM_ID=CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq

# Admin keypair paths (for production)
SUPER_ADMIN_1_PATH=~/.config/solana/super-admin-1.json
SUPER_ADMIN_2_PATH=~/.config/solana/super-admin-2.json
SUPER_ADMIN_3_PATH=~/.config/solana/super-admin-3.json
```

---

## **Step 7: Production Deployment Checklist**

### **Security Steps:**
1. **Generate secure keypairs** for all admin roles
2. **Store private keys securely** (Hardware Security Modules recommended)
3. **Test on devnet first** before mainnet deployment
4. **Verify all admin functions** work correctly
5. **Document recovery procedures** in case of key loss

### **Deployment Commands:**
```bash
# 1. Build for production
anchor build --verifiable

# 2. Deploy to mainnet
anchor deploy --provider.cluster mainnet

# 3. Initialize admin hierarchy
anchor run initialize-admin-hierarchy --provider.cluster mainnet

# 4. Set up your admin team
# (Follow the add-super and add-regular commands above)

# 5. Verify setup
anchor run admin-info --provider.cluster mainnet
```

---

## **Common Commands Summary**

| Action | Command |
|--------|---------|
| **Deploy Contract** | `anchor deploy` |
| **Initialize System** | `npx ts-node scripts/setup-admins.ts init` |
| **Add Super Admin** | `npx ts-node scripts/setup-admins.ts add-super <pubkey>` |
| **Add Regular Admin** | `npx ts-node scripts/setup-admins.ts add-regular <pubkey>` |
| **View Admins** | `npx ts-node scripts/setup-admins.ts info` |
| **Complete Setup** | `npx ts-node scripts/setup-admins.ts setup` |
| **Run Tests** | `anchor test` |

---

## **Admin Hierarchy Rules**

### **Super Admins (Tier 1)**
- **Maximum Count**: Exactly 3 accounts (hard limit)
- **Permissions**: Ultimate authority with full system control
- **Management Powers**: Can manage both super admins and regular admins
- **Self-Governance**: Can add/remove other super admins (within the 3-account limit)
- **Protection**: Cannot remove the last super admin (prevents system lockout)

### **Regular Admins (Tier 2)**
- **Maximum Count**: Unlimited
- **Permissions**: Standard administrative privileges (excluding admin management)
- **Management Powers**: Cannot manage other admins at any level
- **Dependency**: Completely dependent on super admins for any role changes
- **Functions**: Can create markets, events, end primary markets, collect fees

---

## **Error Codes**

The hierarchical admin system uses custom error codes (6100-6199):

| Code | Error | Description |
|------|-------|-------------|
| 6100 | `MaxSuperAdminsExceeded` | Trying to add more than 3 super admins |
| 6101 | `CannotRemoveLastSuperAdmin` | Attempting to remove the final super admin |
| 6102 | `AdminAlreadyExists` | Admin already exists in the system |
| 6103 | `AdminNotFound` | Admin not found for removal/promotion |
| 6104 | `InsufficientAdminPrivileges` | Insufficient privileges for operation |
| 6105 | `RegularAdminUnauthorized` | Regular admin attempted restricted operation |
| 6106 | `SuperAdminRequired` | Operation requires super admin privileges |

---

## **Integration with Privy**

Since you're using Privy for account abstraction, you can:

1. **Generate admin keypairs** on your backend
2. **Store them securely** in your server environment
3. **Use them programmatically** to manage the admin hierarchy
4. **Rotate admins** as needed for security

This gives you the flexibility to add frontend admins, integration admins, and operational admins while maintaining the 3 super admin security model!

---

## **Support**

For issues or questions:
1. Check the error codes above
2. Review the test files in `tests/instructions/`
3. Examine the smart contract source code in `programs/balrmarket/src/`
4. Run `anchor test` to verify system functionality