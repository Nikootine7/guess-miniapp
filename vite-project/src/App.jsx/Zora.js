import { ethers } from "ethers";
import { NFT_CONTRACT_ADDRESS, NFT_TOKEN_ID } from "./config";

export async function mintNFT(signer) {
  const abi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external"
  ];
  const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, abi, signer);

  const tx = await contract.safeTransferFrom(
    await signer.getAddress(),
    await signer.getAddress(), // یا آدرس خریدار/owner
    NFT_TOKEN_ID
  );
  return tx;
}