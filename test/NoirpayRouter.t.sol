// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NoirpayRouter} from "../src/NoirpayRouter.sol";
import {MockUSDG} from "../src/test/MockUSDG.sol";

contract NoirpayRouterTest is Test {
    NoirpayRouter router;
    MockUSDG usdg;
    address payer = makeAddr("payer");
    address stealthA = makeAddr("stealthA");
    address stealthB = makeAddr("stealthB");
    bytes eph = hex"02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function setUp() public {
        router = new NoirpayRouter();
        usdg = new MockUSDG();
        usdg.mint(payer, 1_000e6);
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        usdg.approve(address(router), type(uint256).max);
    }

    function _meta(uint256 amount) internal view returns (bytes memory) {
        return abi.encodePacked(bytes1(0x7a), bytes4(0x23b872dd), address(usdg), amount);
    }

    function _p(address to, uint256 amount, uint256 stipend) internal view returns (NoirpayRouter.Payment memory) {
        return NoirpayRouter.Payment(to, amount, stipend, eph, _meta(amount));
    }

    function test_pay_transfers_stipends_and_announces() public {
        vm.expectEmit(true, true, true, true);
        emit Announcement(1, stealthA, payer, eph, _meta(100e6));
        vm.prank(payer);
        router.pay{value: 0.00003 ether}(address(usdg), _p(stealthA, 100e6, 0.00003 ether));
        assertEq(usdg.balanceOf(stealthA), 100e6);
        assertEq(stealthA.balance, 0.00003 ether);
        assertEq(usdg.balanceOf(payer), 900e6);
        assertEq(address(router).balance, 0);
    }

    function test_pay_reverts_on_stipend_mismatch() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(NoirpayRouter.StipendMismatch.selector, 0.00003 ether, 0));
        router.pay(address(usdg), _p(stealthA, 100e6, 0.00003 ether));
    }

    function test_pay_reverts_on_zero_recipient() public {
        vm.prank(payer);
        vm.expectRevert(NoirpayRouter.ZeroRecipient.selector);
        router.pay(address(usdg), _p(address(0), 1, 0));
    }

    function test_pay_without_allowance_reverts() public {
        address other = makeAddr("other");
        usdg.mint(other, 10e6);
        vm.prank(other);
        vm.expectRevert();
        router.pay(address(usdg), _p(stealthA, 10e6, 0));
    }

    function test_payBatch_pays_everyone_once() public {
        NoirpayRouter.Payment[] memory ps = new NoirpayRouter.Payment[](2);
        ps[0] = _p(stealthA, 250e6, 0.00001 ether);
        ps[1] = _p(stealthB, 75e6, 0.00002 ether);
        vm.prank(payer);
        router.payBatch{value: 0.00003 ether}(address(usdg), ps);
        assertEq(usdg.balanceOf(stealthA), 250e6);
        assertEq(usdg.balanceOf(stealthB), 75e6);
        assertEq(stealthA.balance, 0.00001 ether);
        assertEq(stealthB.balance, 0.00002 ether);
        assertEq(usdg.balanceOf(payer), 675e6);
    }

    function test_payBatch_reverts_when_value_does_not_match_sum() public {
        NoirpayRouter.Payment[] memory ps = new NoirpayRouter.Payment[](2);
        ps[0] = _p(stealthA, 1e6, 0.00001 ether);
        ps[1] = _p(stealthB, 1e6, 0.00002 ether);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(NoirpayRouter.StipendMismatch.selector, 0.00003 ether, 0.00001 ether));
        router.payBatch{value: 0.00001 ether}(address(usdg), ps);
    }

    function test_announce_emits_for_caller() public {
        vm.expectEmit(true, true, true, true);
        emit Announcement(1, stealthB, stealthA, eph, _meta(5e6));
        vm.prank(stealthA);
        router.announce(stealthB, eph, _meta(5e6));
    }

    function test_announce_rejects_zero() public {
        vm.expectRevert(NoirpayRouter.ZeroRecipient.selector);
        router.announce(address(0), eph, "");
    }

    function test_stipend_to_reverting_recipient_reverts() public {
        Rejects r = new Rejects();
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(NoirpayRouter.StipendFailed.selector, address(r)));
        router.pay{value: 1}(address(usdg), _p(address(r), 1e6, 1));
    }

    function testFuzz_pay_conserves_balances(uint96 amount, uint64 stipend) public {
        amount = uint96(bound(amount, 0, 1_000e6));
        stipend = uint64(bound(stipend, 0, 0.5 ether));
        vm.prank(payer);
        router.pay{value: stipend}(address(usdg), _p(stealthA, amount, stipend));
        assertEq(usdg.balanceOf(stealthA) + usdg.balanceOf(payer), 1_000e6);
        assertEq(stealthA.balance, stipend);
    }
}

contract Rejects {
    receive() external payable {
        revert("no");
    }
}
