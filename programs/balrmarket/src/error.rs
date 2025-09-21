use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized = 6000,
    
    #[msg("Invalid input parameters")]
    InvalidInput = 6001,
    
    #[msg("Market ID too long (max 50 characters)")]
    MarketIdTooLong = 6002,
    
    #[msg("Team name too long (max 100 characters)")]
    TeamNameTooLong = 6003,
    
    #[msg("Event ID too long (max 50 characters)")]
    EventIdTooLong = 6004,
    
    #[msg("Question too long (max 200 characters)")]
    QuestionTooLong = 6005,
    
    #[msg("Invalid share count (must be > 0 and <= 1000)")]
    InvalidShareCount = 6006,
    
    #[msg("Share count must be even")]
    ShareCountMustBeEven = 6007,
    
    #[msg("Invalid odds (must be > 0 and < 10000 basis points)")]
    InvalidOdds = 6008,
    
    #[msg("Match too soon (must be at least 24 hours in future)")]
    MatchTooSoon = 6009,
    
    #[msg("System is paused")]
    SystemPaused = 6010,
    
    #[msg("Invalid market status")]
    InvalidMarketStatus = 6011,
    
    #[msg("Event already exists")]
    EventAlreadyExists = 6012,
    
    #[msg("Market not found")]
    MarketNotFound = 6013,
    
    #[msg("Event not found")]
    EventNotFound = 6014,
    
    #[msg("Insufficient funds")]
    InsufficientFunds = 6015,
    
    #[msg("Order not found")]
    OrderNotFound = 6016,
    
    #[msg("Market phase mismatch")]
    MarketPhaseMismatch = 6017,
    
    #[msg("Share not owned by user")]
    ShareNotOwned = 6018,
    
    #[msg("Event already resolved")]
    EventAlreadyResolved = 6019,
    
    #[msg("Event not yet resolved")]
    EventNotResolved = 6020,
    
    #[msg("Primary market closed")]
    PrimaryMarketClosed = 6021,
    
    #[msg("Secondary market closed")]
    SecondaryMarketClosed = 6022,
    
    #[msg("Invalid order quantity")]
    InvalidOrderQuantity = 6023,
    
    #[msg("Invalid order price")]
    InvalidOrderPrice = 6024,
    
    #[msg("Maximum shares exceeded")]
    MaxSharesExceeded = 6025,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow = 6026,
    
    #[msg("No matching order found")]
    NoMatchingOrder = 6027,
    
    #[msg("Order already filled")]
    OrderAlreadyFilled = 6028,
    
    #[msg("Cannot trade with yourself")]
    CannotTradeWithSelf = 6029,
    
    #[msg("Invalid outcome")]
    InvalidOutcome = 6030,
    
    #[msg("Invalid price sum - prices don't total 1 SOL")]
    InvalidPriceSum = 6031,
    
    #[msg("Insufficient shares - exceeds remaining event shares")]
    InsufficientShares = 6032,
    
    #[msg("Order already matched")]
    OrderAlreadyMatched = 6033,
    
    #[msg("No compatible orders found")]
    NoCompatibleOrders = 6034,
    
    #[msg("Share token already exists")]
    ShareTokenAlreadyExists = 6035,
    
    #[msg("Invalid share type")]
    InvalidShareType = 6036,
    
    #[msg("Event has not started yet")]
    EventNotStarted = 6037,
    
    #[msg("Primary market already closed")]
    PrimaryAlreadyClosed = 6038,
    
    #[msg("Primary market not closed")]
    PrimaryNotClosed = 6039,
    
    #[msg("Order not pending")]
    OrderNotPending = 6040,
    
    #[msg("No platform fees to collect")]
    NoFeesToCollect = 6041,
    
    #[msg("No unmatched orders found")]
    NoUnmatchedOrders = 6042,
    
    #[msg("Platform fee exceeds maximum allowed (5%)")]
    PlatformFeeExceedsMaximum = 6043,
    
    #[msg("Account balance insufficient for rent exemption")]
    InsufficientRentBalance = 6044,
    
    #[msg("Invalid share token configuration")]
    InvalidShareToken = 6045,
    
    #[msg("Share minting failed - duplicate attempt")]
    ShareAlreadyMinted = 6046,
    
    // Admin Hierarchy Error Codes (6100-6199)
    #[msg("Maximum super admin limit exceeded (max 3)")]
    MaxSuperAdminsExceeded = 6100,
    
    #[msg("Cannot remove the last super admin")]
    CannotRemoveLastSuperAdmin = 6101,
    
    #[msg("Admin already exists in the system")]
    AdminAlreadyExists = 6102,
    
    #[msg("Admin not found")]
    AdminNotFound = 6103,
    
    #[msg("Insufficient admin privileges - super admin required")]
    InsufficientAdminPrivileges = 6104,
    
    #[msg("Regular admin cannot perform this operation")]
    RegularAdminUnauthorized = 6105,
    
    #[msg("Super admin required for admin management operations")]
    SuperAdminRequired = 6106,
}