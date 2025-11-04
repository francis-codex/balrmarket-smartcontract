use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::sysvar::instructions::{
    load_instruction_at_checked, ID as IX_SYSVAR_ID
};
use crate::error::ErrorCode;

/// V2: Signature verification utilities for off-chain bidding
///
/// The buyer signs a message off-chain containing all bid parameters.
/// This signature is verified on-chain using Solana's Ed25519 program.
///
/// SECURITY: This prevents unauthorized bid creation and ensures buyers
/// explicitly consent to the bid terms.

/// Create the canonical message format that buyers must sign
///
/// Message format (fixed-size, deterministic):
/// - program_id: 32 bytes (prevents cross-program attacks)
/// - order_id: 8 bytes (little-endian u64)
/// - bid_id: 8 bytes (little-endian u64)
/// - event_id: 50 bytes (padded with zeros)
/// - quantity: 8 bytes (little-endian u64)
/// - price_per_share: 8 bytes (little-endian u64)
/// - nonce: 8 bytes (little-endian u64)
/// - timestamp: 8 bytes (little-endian i64)
///
/// Total: 130 bytes
pub fn create_bid_message(
    program_id: &Pubkey,
    order_id: u64,
    bid_id: u64,
    event_id: &str,
    quantity: u64,
    price_per_share: u64,
    nonce: u64,
    timestamp: i64,
) -> Vec<u8> {
    let mut message = Vec::with_capacity(130);

    // Add program ID to prevent cross-program replay attacks
    message.extend_from_slice(program_id.as_ref());

    // Add order and bid IDs
    message.extend_from_slice(&order_id.to_le_bytes());
    message.extend_from_slice(&bid_id.to_le_bytes());

    // Add event ID (fixed length, padded to 50 bytes)
    let mut event_bytes = event_id.as_bytes().to_vec();
    event_bytes.resize(50, 0);
    message.extend_from_slice(&event_bytes);

    // Add bid parameters
    message.extend_from_slice(&quantity.to_le_bytes());
    message.extend_from_slice(&price_per_share.to_le_bytes());
    message.extend_from_slice(&nonce.to_le_bytes());
    message.extend_from_slice(&timestamp.to_le_bytes());

    message
}

/// Verify Ed25519 signature using Solana's Ed25519 program
///
/// IMPORTANT SECURITY CONSIDERATIONS:
///
/// 1. This function requires the transaction to include an Ed25519 instruction
///    BEFORE the current instruction in the instruction sysvar.
///
/// 2. The Ed25519 instruction must be constructed by the backend with:
///    - The correct public key (buyer)
///    - The correct signature
///    - The correct message
///
/// 3. Solana's Ed25519 program verifies the signature during transaction processing.
///    If the signature is invalid, the Ed25519 instruction would have failed,
///    causing the entire transaction to fail before reaching this point.
///
/// 4. This function validates that the Ed25519 instruction contains the expected
///    data (public key, signature, message) to prevent malicious transaction
///    construction.
///
/// # Arguments
/// * `signature` - The Ed25519 signature bytes [u8; 64]
/// * `public_key` - The public key that should have signed the message
/// * `message` - The message that was signed
/// * `ix_sysvar` - The instructions sysvar account
/// * `ix_index` - The index of the Ed25519 instruction (usually 0)
///
/// # Returns
/// * `Ok(())` if signature is valid
/// * `Err(ErrorCode)` if signature is invalid or verification fails
pub fn verify_bid_signature(
    signature: &[u8; 64],
    public_key: &Pubkey,
    message: &[u8],
    ix_sysvar: &AccountInfo,
    ix_index: u16,
) -> Result<()> {
    // Verify this is the instructions sysvar
    require_keys_eq!(
        *ix_sysvar.key,
        IX_SYSVAR_ID,
        ErrorCode::InvalidInstructionsSysvar
    );

    // Load the Ed25519 instruction from sysvar
    let ix: Instruction = load_instruction_at_checked(ix_index as usize, ix_sysvar)
        .map_err(|_| ErrorCode::InvalidSignatureInstruction)?;

    // Verify it's the Ed25519 program
    require_keys_eq!(
        ix.program_id,
        ed25519_program::ID,
        ErrorCode::InvalidSignatureInstruction
    );

    // Parse Ed25519 instruction data
    // Format: [num_signatures: u8, padding: u8, signature_offset: u16,
    //          signature_ix_index: u16, public_key_offset: u16,
    //          public_key_ix_index: u16, message_offset: u16,
    //          message_size: u16, message_ix_index: u16,
    //          public_key: [u8; 32], signature: [u8; 64], message: [u8]]

    // Minimum instruction data size check
    require!(
        ix.data.len() >= 108,
        ErrorCode::InvalidSignatureInstruction
    );

    // Verify number of signatures is 1
    require_eq!(
        ix.data[0],
        1,
        ErrorCode::InvalidSignatureInstruction
    );

    // Parse offsets (little-endian u16)
    let signature_offset = u16::from_le_bytes([ix.data[2], ix.data[3]]) as usize;
    let public_key_offset = u16::from_le_bytes([ix.data[6], ix.data[7]]) as usize;
    let message_offset = u16::from_le_bytes([ix.data[10], ix.data[11]]) as usize;
    let message_size = u16::from_le_bytes([ix.data[12], ix.data[13]]) as usize;

    // Verify offsets are within bounds
    require!(
        public_key_offset + 32 <= ix.data.len(),
        ErrorCode::InvalidSignatureInstruction
    );
    require!(
        signature_offset + 64 <= ix.data.len(),
        ErrorCode::InvalidSignatureInstruction
    );
    require!(
        message_offset + message_size <= ix.data.len(),
        ErrorCode::InvalidSignatureInstruction
    );

    // Extract and verify public key
    let ix_pubkey = &ix.data[public_key_offset..public_key_offset + 32];
    require!(
        ix_pubkey == public_key.as_ref(),
        ErrorCode::SignaturePublicKeyMismatch
    );

    // Extract and verify signature
    let ix_signature = &ix.data[signature_offset..signature_offset + 64];
    require!(
        ix_signature == signature,
        ErrorCode::SignatureMismatch
    );

    // Extract and verify message
    require!(
        message_size == message.len(),
        ErrorCode::SignatureMessageMismatch
    );
    let ix_message = &ix.data[message_offset..message_offset + message_size];
    require!(
        ix_message == message,
        ErrorCode::SignatureMessageMismatch
    );

    // If we reach here, the Ed25519 program has verified the signature
    // and all the data matches what we expect
    Ok(())
}

/// Helper function to validate signature timestamp
///
/// Ensures the signature was created within an acceptable time window
/// to prevent replay of very old signatures.
///
/// # Arguments
/// * `signature_timestamp` - When the signature was created (from bid data)
/// * `current_timestamp` - Current blockchain timestamp
/// * `max_age_seconds` - Maximum acceptable age of signature
///
/// # Returns
/// * `Ok(())` if timestamp is valid
/// * `Err(ErrorCode::BidTimestampTooOld)` if signature is too old
pub fn validate_signature_timestamp(
    signature_timestamp: i64,
    current_timestamp: i64,
    max_age_seconds: i64,
) -> Result<()> {
    let age = current_timestamp
        .checked_sub(signature_timestamp)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    require!(
        age >= 0 && age <= max_age_seconds,
        ErrorCode::BidTimestampTooOld
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_bid_message() {
        let program_id = Pubkey::new_unique();
        let order_id = 123u64;
        let bid_id = 456u64;
        let event_id = "TEST_EVENT";
        let quantity = 10u64;
        let price_per_share = 500_000_000u64;
        let nonce = 789u64;
        let timestamp = 1234567890i64;

        let message = create_bid_message(
            &program_id,
            order_id,
            bid_id,
            event_id,
            quantity,
            price_per_share,
            nonce,
            timestamp,
        );

        // Verify message length
        assert_eq!(message.len(), 130);

        // Verify program ID is at the start
        assert_eq!(&message[0..32], program_id.as_ref());

        // Verify order_id
        let order_id_bytes = &message[32..40];
        assert_eq!(u64::from_le_bytes(order_id_bytes.try_into().unwrap()), order_id);

        // Verify bid_id
        let bid_id_bytes = &message[40..48];
        assert_eq!(u64::from_le_bytes(bid_id_bytes.try_into().unwrap()), bid_id);

        // Verify event_id (first 10 bytes should match "TEST_EVENT")
        let event_id_bytes = &message[48..58];
        assert_eq!(event_id_bytes, b"TEST_EVENT");
    }

    #[test]
    fn test_validate_signature_timestamp() {
        let current_time = 1000i64;
        let max_age = 3600i64; // 1 hour

        // Valid: signature from 30 minutes ago
        assert!(validate_signature_timestamp(
            current_time - 1800,
            current_time,
            max_age
        ).is_ok());

        // Invalid: signature from 2 hours ago
        assert!(validate_signature_timestamp(
            current_time - 7200,
            current_time,
            max_age
        ).is_err());

        // Invalid: signature from the future
        assert!(validate_signature_timestamp(
            current_time + 100,
            current_time,
            max_age
        ).is_err());
    }

    #[test]
    fn test_message_determinism() {
        let program_id = Pubkey::new_unique();
        let order_id = 999u64;
        let bid_id = 111u64;
        let event_id = "DETERMINISTIC";
        let quantity = 50u64;
        let price_per_share = 750_000_000u64;
        let nonce = 12345u64;
        let timestamp = 9876543210i64;

        // Create message twice with same inputs
        let message1 = create_bid_message(
            &program_id,
            order_id,
            bid_id,
            event_id,
            quantity,
            price_per_share,
            nonce,
            timestamp,
        );

        let message2 = create_bid_message(
            &program_id,
            order_id,
            bid_id,
            event_id,
            quantity,
            price_per_share,
            nonce,
            timestamp,
        );

        // Messages should be identical
        assert_eq!(message1, message2);
    }
}
