import { BigNumber } from '@ethersproject/bignumber';
import { RwaAuthorizationData, RwaSwap, SwapType } from '../types';
import { SwapInfo } from '@balancer-labs/sor';
import { SingleSwapBuilder } from './single_swap_builder'; // Adjust the import path as needed
import { Interface } from '@ethersproject/abi';

class RwaSingleSwapBuilder extends SingleSwapBuilder {
  // Override the functionName property to 'rwaSwap'
  private authorization!: RwaAuthorizationData;
  readonly functionName = 'rwaSwap';

  constructor(swapInfo: SwapInfo, kind: SwapType, chainId: number) {
    super(swapInfo, kind, chainId);
  }

  setAuthorization(authorization: RwaAuthorizationData): void {
    this.authorization = authorization;
  }

  attributes(): RwaSwap {
    if (!this.funds || !this.limit || !this.deadline || !this.authorization) {
      throw new Error('Uninitialized arguments');
    }

    // TODO: Raise errors when some parameters are missing
    let attrs: RwaSwap = {
      request: this.singleSwap,
      funds: this.funds,
      limit: this.limit,
      deadline: this.deadline,
      authorization: this.authorization,
    };

    // TODO: Call this logic from a relayer module maybe? Do we actually need to do that?
    // additional parameters on a contract:
    // https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/standalone-utils/contracts/relayer/VaultActions.sol#L44
    // const fragment = this.fragment();
    // if (fragment[0].inputs && fragment[0].inputs?.length > 4) {
    //   attrs = {
    //     ...attrs,
    //     value: '0',
    //     outputReference: '0',
    //   };
    // }

    return attrs;
  }

  // Override the data() method to use 'rwaSwap'
  data(): string {
    const contractInterface = new Interface(this.fragment());

    return contractInterface.encodeFunctionData(
      'rwaSwap', // Use 'rwaSwap' instead of 'swap'
      Object.values(this.attributes())
    );
  }
}

export { RwaSingleSwapBuilder };
