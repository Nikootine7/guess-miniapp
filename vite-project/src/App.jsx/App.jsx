import React, {useState} from "react";
import WalletConnect from "./components/WalletConnect";
import GameBoard from "./components/GameBoard";

/*
  QUICK SETUP:
   - Edit ownerAddress below to your wallet address (where fees land)
   - Edit initialPrompts to add challenges (title, hint, correctAnswer)
   - feeETH: how much players pay per guess
*/

const OWNER_ADDRESS = "0x717A9688B3b20767ef12A1CE4bE73Eb3e091c3C4"; // <- change this to your address
const FEE_ETH = "0.001"; // default fee per guess in ETH

const initialPrompts = [
  { id: "p1", title: "Guess this pop banger #1", hint: "Car scene — chorus missing", correctAnswer: "Shape of You" },
  { id: "p2", title: "Guess this rap classic", hint: "Instrumental only", correctAnswer: "Lose Yourself" }
];

export default function App(){
  const [wallet, setWallet] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  function handleConnect(info){
    setWallet(info);
    if (info.address && info.address.toLowerCase() === OWNER_ADDRESS.toLowerCase()) setIsOwner(true);
  }

  return (
    <div className="app">
      <WalletConnect onConnect={handleConnect}/>
      <div style={{marginTop:12}}>
        <GameBoard signer={wallet?.signer} ownerAddress={OWNER_ADDRESS} feeETH={FEE_ETH} initialPrompts={initialPrompts} isOwner={isOwner}/>
      </div>

      <div style={{marginTop:16}} className="card">
        <div className="small">Owner address (where fees go): <b>{OWNER_ADDRESS}</b></div>
        <div className="small">Tip: change FEE_ETH in App.jsx to your desired amount per guess. You can later add server-side validation and automatic payouts.</div>
      </div>
    </div>
  );
}