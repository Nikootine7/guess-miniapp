import { ethers } from "ethers";

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No Ethereum wallet found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

// send ETH from user to destination (owner) with value in wei (BigInt or hex string)
export async function sendPayment(signer, toAddress, valueWei) {
  const tx = await signer.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(valueWei.toString()) // valueWei as string in ETH (e.g. "0.001")
  });
  await tx.wait();
  return tx;
}