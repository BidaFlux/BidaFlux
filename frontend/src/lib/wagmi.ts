import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { baseSepolia, unichainSepolia } from "./chains";
import { deployment } from "./config";

export const wagmiConfig = createConfig({
  chains: [baseSepolia, unichainSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(deployment.rpc[baseSepolia.id]),
    [unichainSepolia.id]: http(deployment.rpc[unichainSepolia.id]),
  },
  ssr: true,
});
