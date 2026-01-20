---
title: Fee Flow Controller Mechanics
impact: MEDIUM
impactDescription: Understanding protocol revenue and fee distribution
tags: fees, feeflow, auction, revenue, protocol
---

## Fee Flow Controller Mechanics

FeeFlowController implements continuous Dutch auctions to sell accumulated protocol fees. It converts vault shares (from interest fees) into payment tokens for the DAO.

**Incorrect (expecting direct fee claiming):**

```solidity
// WRONG: Fees are not claimed directly
IEVault vault = IEVault(vaultAddress);
vault.claimFees(); // This doesn't exist!
```

**Correct (understanding fee flow architecture):**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

IEVault vault = IEVault(vaultAddress);

// Interest fees accumulate in the vault as shares
// interestFee is the percentage of interest that goes to protocol
uint16 interestFee = vault.interestFee(); // e.g., 0.1e4 = 10%

// Accumulated fees are in vault shares
uint256 accumulatedFees = vault.accumulatedFees();

// The fee receiver is typically the FeeFlowController
address feeReceiver = vault.feeReceiver();

// convertFees() converts accumulated shares to the fee receiver
// Anyone can call this to trigger the conversion
vault.convertFees();
```

**Correct (interacting with FeeFlowController):**

```solidity
import {FeeFlowControllerEVK} from "evk-periphery/FeeFlow/FeeFlowControllerEVK.sol";

FeeFlowControllerEVK feeFlow = FeeFlowControllerEVK(feeFlowAddress);

// Get current auction state
FeeFlowControllerEVK.Slot0 memory slot0 = feeFlow.getSlot0();
uint256 currentPrice = feeFlow.getPrice();

// Auction parameters (immutable)
uint256 epochPeriod = feeFlow.epochPeriod();      // Auction duration
uint256 priceMultiplier = feeFlow.priceMultiplier(); // Price scaling
uint256 minInitPrice = feeFlow.minInitPrice();    // Minimum starting price

// Payment token (what buyer pays)
address paymentToken = address(feeFlow.paymentToken());

// Payment receiver (where payment goes)
address paymentReceiver = feeFlow.paymentReceiver();
```

**Correct (buying from the auction):**

```solidity
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

// Dutch auction: price starts high and decreases over epoch
// Anyone can buy all accumulated assets at current price

// Step 1: Check current price
uint256 price = feeFlow.getPrice();

// Step 2: Check available assets
address[] memory assets = new address[](2);
assets[0] = vault1ShareToken;  // Vault 1 shares
assets[1] = vault2ShareToken;  // Vault 2 shares

// Step 3: Approve payment token
IERC20(paymentToken).approve(address(feeFlow), price);

// Step 4: Buy all assets
// This converts fees, transfers payment, and sends assets to buyer
feeFlow.buy(
    assets,           // Asset addresses to receive
    msg.sender,       // Receiver of assets
    slot0.epochId,    // Current epoch ID
    block.timestamp + 1 hours, // Deadline
    price * 101 / 100 // Max payment (with 1% slippage)
);
```

**Key FeeFlow Concepts:**

1. **Dutch Auction**: Price decreases linearly over epoch period
2. **Epoch Reset**: After each buy, new auction starts with adjusted initial price
3. **Price Adaptation**: Initial price adjusts based on settlement price (priceMultiplier)
4. **Atomic Operation**: Calls convertFees() on all vaults before transfer
5. **Optional Hook**: Can trigger additional operations on each buy

**TypeScript: Monitoring fee flow auctions:**

```typescript
import { getContract, formatEther } from 'viem';

const feeFlow = getContract({
  address: feeFlowAddress,
  abi: feeFlowABI,
  client: publicClient,
});

// Get auction state
const slot0 = await feeFlow.read.getSlot0();
const currentPrice = await feeFlow.read.getPrice();
const epochPeriod = await feeFlow.read.epochPeriod();

console.log(`Current Epoch: ${slot0.epochId}`);
console.log(`Current Price: ${formatEther(currentPrice)} tokens`);
console.log(`Epoch Start: ${new Date(Number(slot0.startTime) * 1000)}`);

// Calculate time remaining in epoch
const elapsed = BigInt(Math.floor(Date.now() / 1000)) - slot0.startTime;
const remaining = epochPeriod - elapsed;
console.log(`Time Remaining: ${remaining} seconds`);

// Price decreases linearly:
// price = initPrice - (initPrice * timePassed / epochPeriod)
// At epoch end, price = 0 (free!)
```

**Cross-Chain Fee Collection:**

FeeFlowControllerEVK supports bridging payment tokens to other chains via LayerZero OFT adapters, enabling unified treasury management across networks.

Reference: [FeeFlowControllerEVK.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/FeeFlow/FeeFlowControllerEVK.sol)
