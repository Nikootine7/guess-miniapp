import React, { useState, useEffect } from "react";
import { sendPayment } from "../utils/ethers";
import { mintNFT } from "../Zora";
import { NFT_CONTRACT_ADDRESS, NFT_TOKEN_ID } from "../config";

/*
Props:
- signer (ethers.Signer) or null
- ownerAddress: where fees go (string)
- feeETH: string number in ETH (ex: "0.001")
- initialPrompts: array of {id, title, hint, correctAnswer}
- isOwner: boolean
*/

export default function GameBoard({ signer, ownerAddress, feeETH = "0.001", initialPrompts = [], isOwner = false }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [selected, setSelected] = useState(null);
  const [guess, setGuess] = useState("");
  const [status, setStatus] = useState("");
  const [submissions, setSubmissions] = useState({}); // promptId -> array of {addr, guess, txHash}

  useEffect(() => {
    setPrompts(initialPrompts);
  }, [initialPrompts]);

  async function submitGuess(promptId) {
    if (!signer) return alert("Connect wallet first");
    if (!guess || guess.trim().length < 1) return alert("Write a guess");

    setStatus("Sending payment...");
    try {
      // send payment to owner
      const tx = await sendPayment(signer, ownerAddress, feeETH);
      const txHash = tx.hash || tx.transactionHash || "unknown";

      // store locally
const addr = (await signer.getAddress()).toLowerCase();
setSubmissions((prev) => {
  const arr = prev[promptId] ? [...prev[promptId]] : [];
  arr.push({ addr, guess: guess.trim(), txHash, time: Date.now() });
  return { ...prev, [promptId]: arr };
});
      setStatus("Guess submitted! Waiting owner to reveal.");
      setGuess("");
    } catch (e) {
      setStatus("Payment failed: " + (e.message || e));
    }
  }

  async function ownerMintNFT(promptId) {
    if (!isOwner) return alert("Only owner can mint NFT");
    if (!signer) return alert("Connect wallet first");
    try {
      setStatus("Minting NFT...");
      const tx = await mintNFT(signer);
      await tx.wait();
      setStatus("NFT minted successfully!");
    } catch (e) {
      setStatus("NFT mint failed: " + (e.message || e));
    }
  }

  function ownerReveal(promptId) {
    if (!isOwner) return;
    setPrompts((prev) =>
      prev.map((x) => (x.id === promptId ? { ...x, revealed: true } : x))
    );
    setStatus("Revealed");
  }

  function ownerAward(promptId) {
    if (!isOwner) return;
    const arr = submissions[promptId] || [];
    const winners = arr.filter(
      (s) => {
        const p = prompts.find((x) => x.id === promptId);
        return p && s.guess.toLowerCase() === p.correctAnswer.toLowerCase();
      }
    );
    setStatus(`Found ${winners.length} winners (check console)`);
    console.log("Winners:", winners);
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Active Challenges</h3>
      {prompts.length === 0 && <div className="small">No challenges loaded yet. Owner can add prompts in code.</div>}
      {prompts.map((p) => (
        <div key={p.id} style={{ marginTop: 12 }} className="game-row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{p.title}</div>
            <div className="hint">{p.hint || "Guess the song from the clip. Pay to submit."}</div>
            {p.revealed && <div className="small">Answer: {p.correctAnswer}</div>}
            <div className="small">Fee to play: {feeETH} ETH</div>
          </div>

          <div style={{ minWidth: 320 }}>
            <input
              className="input"
              placeholder="Type your guess..."
              value={selected === p.id ? guess : ""}
              onChange={(e) => {
                if (selected !== p.id) setSelected(p.id);
                setGuess(e.target.value);
              }}
            />
            <div className="center" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => submitGuess(p.id)}>
                Submit Guess (pay)
              </button>
              {isOwner && (
                <><button className="btn" style={{ background: "#4caf50" }} onClick={() => ownerReveal(p.id)}>
                    Reveal
                  </button>
                  <button className="btn" style={{ background: "#ff9f1c" }} onClick={() => ownerAward(p.id)}>
                    Find Winners
                  </button>
                  <button className="btn" style={{ background: "#9b59b6" }} onClick={() => ownerMintNFT(p.id)}>
                    Mint NFT
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12 }} className="small">
        Status: {status}
      </div>
    </div>
  );
}