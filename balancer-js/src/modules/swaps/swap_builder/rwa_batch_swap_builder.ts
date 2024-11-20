import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { FundManagement, SwapType } from '../types';
import { Interface, JsonFragment } from '@ethersproject/abi';
import { SwapInfo } from '@balancer-labs/sor';
import { SDKSwapInfo, decorateSorSwapInfo } from './swap_info_decorator';
import { AddressZero } from '@ethersproject/constants';
import { swapFragment, relayerResolver, SwapRelayer } from './swap_utils';
import { RwaAuthorizationData, RwaBatchSwap } from '../types';

class RwaBatchSwapBuilder {
  private swapInfo: SDKSwapInfo;
  funds?: FundManagement;
  limits?: BigNumberish[];
  deadline?: string;
  relayer: SwapRelayer;
  private authorization!: RwaAuthorizationData;
  readonly functionName = 'rwaBatchSwap';

  /**
   * Building swap transaction data
   *
   * @param swapInfo SOR result
   * @param kind
   */
  constructor(
    swapInfo: SwapInfo,
    private readonly kind: SwapType,
    private readonly chainId: number
  ) {
    this.swapInfo = decorateSorSwapInfo(swapInfo, kind);
    this.relayer = relayerResolver(
      this.swapInfo.tokenIn,
      this.swapInfo.tokenOut,
      this.chainId
    );
  }

  setAuthorization(authorization: RwaAuthorizationData): void {
    this.authorization = authorization;
  }

  setFunds(sender: string, recipient?: string): void {
    this.funds = {
      sender,
      recipient: recipient || sender,
      fromInternalBalance: false,
      toInternalBalance: false,
    };
  }

  /**
   * @param deadline block timestamp
   */
  setDeadline(deadline: string): void {
    this.deadline = deadline;
  }

  /**
   * Given IN it's the minimum amount we are willing to accept.
   * Given OUT it's the fixed amount defined as output.
   */
  minAmountOut(maxSlippage: number): BigNumber {
    return this.kind === SwapType.SwapExactIn
      ? this.swapInfo.amountOutForLimits.min(maxSlippage)
      : this.swapInfo.amountOutForLimits.amount;
  }

  /**
   * Given IN it's the fixed amount we define as input.
   * Given OUT it's the maximum amount we are willing to pay for the request.
   */
  maxAmountIn(maxSlippage: number): BigNumber {
    return this.kind === SwapType.SwapExactOut
      ? this.swapInfo.amountInForLimits.max(maxSlippage)
      : this.swapInfo.amountInForLimits.amount;
  }

  /**
   * Calculates limits for token amount.
   * Maximum number of tokens to send is a positive number
   * Minimum amount of tokens to receive is a negative number
   * https://dev.balancer.fi/guides/swaps/batch-swaps
   * https://dev.balancer.fi/resources/swaps/batch-swaps#multi-hop-examples
   *
   * For batchSwap:
   * An array of of the maximum net amounts of each asset which can be taken to perform the swap.
   * Should the total trade require more than limits[i] tokens to be taken from sender for any i
   * then the transaction shall fail.
   *
   * @param maxSlippage [bps], eg: 1 === 0.01%, 100 === 1%
   */
  setLimits(maxSlippage: number): void {
    // TODO: This implementation handles only a single input. We might want to extend it for multiple token inputs
    this.limits = this.swapInfo.tokenAddresses
      .map((token: string) => {
        let amount = BigNumber.from(0);
        if (token === this.swapInfo.tokenInForSwaps) {
          amount = this.maxAmountIn(maxSlippage);
        }
        if (token === this.swapInfo.tokenOutFromSwaps) {
          amount = this.minAmountOut(maxSlippage).mul(-1);
        }
        return amount;
      })
      .map((limit: BigNumber) => limit.toString().split('.')[0]);
  }

  attributes(): RwaBatchSwap {
    // TODO: Raise errors when some parameters are missing
    if (!this.funds || !this.limits || !this.deadline || !this.authorization) {
      throw new Error('Uninitialized arguments');
    }

    let attrs: RwaBatchSwap = {
      kind: this.kind,
      swaps: this.swapInfo.swaps,
      assets: this.swapInfo.tokenAddresses,
      funds: this.funds,
      limits: this.limits,
      deadline: this.deadline,
      authorization: this.authorization,
    };

    const fragment = this.fragment();

    // TODO: Call this logic from a relayer module maybe? Do we actually need to do that?
    // additional parameters on a contract:
    // https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/standalone-utils/contracts/relayer/VaultActions.sol#L67
    if (fragment[0].inputs && fragment[0].inputs?.length > 6) {
      attrs = {
        ...attrs,
        value: '0',
        outputReferences: [],
      };
    }

    return attrs;
  }

  data(): string {
    const contractInterface = new Interface(this.fragment());

    return contractInterface.encodeFunctionData(
      'rwaBatchSwap',
      Object.values(this.attributes())
    );
  }

  value(maxSlippage: number): BigNumber {
    let amount = BigNumber.from(0);
    if (this.swapInfo.tokenIn === AddressZero)
      amount = this.maxAmountIn(maxSlippage);
    return amount;
  }

  to(): string {
    return this.relayer.address;
  }

  private fragment(): JsonFragment[] {
    return swapFragment(this.relayer).filter(
      (f: JsonFragment) => f.name === this.functionName
    );
  }
}

export { RwaBatchSwapBuilder };
