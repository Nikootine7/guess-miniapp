import React, {useState} from "react";
import { connectWallet } from "../utils/ethers";

export default function WalletConnect({onConnect}) {
  const [addr, setAddr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handle() {
    try{
      setLoading(true);
      const { provider, signer, address } = await connectWallet();
      setAddr(address);
      onConnect({ provider, signer, address });
    }catch(e){
      alert("Wallet connect failed: " + (e.message || e));
    }finally{ setLoading(false); }
  }

  return (
    <div className="card">
      <div className="header">
        <div>
          <h2>Guess-The-Song — MiniApp</h2>
          <div className="small">Pay to submit guesses. Owner receives ETH.</div>
        </div>
        <div>
          {addr ? <div className="small">Connected: {addr.slice(0,6)}...{addr.slice(-4)}</div>
               : <button className="btn" onClick={handle} disabled={loading}>{loading? "Connecting..." : "Connect Wallet"}</button>}
        </div>
      </div>
    </div>
  );
}