// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NoirpayRouter
/// @notice Stealth payments on Robinhood Chain (ERC-5564, secp256k1 with view tags).
///
/// A payment moves `amount` of an ERC-20 from the caller to a one-time stealth address, forwards a little ETH
/// so that address can pay for gas when it spends, and announces the ephemeral public key the recipient needs to
/// find and unlock the payment. Announcements are public and unlinkable to the recipient's identity: only the
/// holder of the recipient's viewing key can tell which ones are theirs.
///
/// `payBatch` does the same for a whole roster in one transaction (payroll). `announce` lets a stealth address
/// that paid out with a plain `transfer` publish its own announcement.
///
/// The router holds no funds and has no owner.
contract NoirpayRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev ERC-5564 scheme id for secp256k1 + view tags.
    uint256 public constant SCHEME_ID = 1;

    /// @dev ERC-5564 Announcement. `metadata` = viewTag (1) || selector (4) || token (20) || amount (32) [|| ref (32)].
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    error ZeroRecipient();
    error StipendMismatch(uint256 expected, uint256 sent);
    error StipendFailed(address to);

    struct Payment {
        /// @dev One-time address derived by the sender from the recipient's stealth meta-address.
        address stealthAddress;
        /// @dev Token units to transfer (may be zero for a pure announcement + stipend).
        uint256 amount;
        /// @dev Wei of ETH forwarded so the stealth address can pay gas later.
        uint256 stipend;
        /// @dev 33-byte compressed secp256k1 ephemeral public key.
        bytes ephemeralPubKey;
        /// @dev See {Announcement}.
        bytes metadata;
    }

    /// @notice Pay one stealth address. `msg.value` must equal `p.stipend`.
    function pay(address token, Payment calldata p) external payable nonReentrant {
        if (msg.value != p.stipend) revert StipendMismatch(p.stipend, msg.value);
        _pay(token, p);
    }

    /// @notice Pay many stealth addresses in one transaction. `msg.value` must equal the sum of stipends.
    function payBatch(address token, Payment[] calldata ps) external payable nonReentrant {
        uint256 total;
        for (uint256 i; i < ps.length; ++i) {
            total += ps[i].stipend;
        }
        if (msg.value != total) revert StipendMismatch(total, msg.value);
        for (uint256 i; i < ps.length; ++i) {
            _pay(token, ps[i]);
        }
    }

    /// @notice Announce a payment that was settled outside the router (e.g. a plain ERC-20 transfer). Emits only.
    function announce(address stealthAddress, bytes calldata ephemeralPubKey, bytes calldata metadata) external {
        if (stealthAddress == address(0)) revert ZeroRecipient();
        emit Announcement(SCHEME_ID, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }

    function _pay(address token, Payment calldata p) internal {
        if (p.stealthAddress == address(0)) revert ZeroRecipient();
        if (p.amount > 0) IERC20(token).safeTransferFrom(msg.sender, p.stealthAddress, p.amount);
        if (p.stipend > 0) {
            (bool ok,) = p.stealthAddress.call{value: p.stipend}("");
            if (!ok) revert StipendFailed(p.stealthAddress);
        }
        emit Announcement(SCHEME_ID, p.stealthAddress, msg.sender, p.ephemeralPubKey, p.metadata);
    }
}
