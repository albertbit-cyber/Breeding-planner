import { createContext, useContext } from "react";

// The signed-in account as the app chrome needs it: who is signed in, and how to sign out.
// AuthGate provides it; outside AuthGate (tests, the public scope) it is null and the
// account menu renders nothing.
export const AccountContext = createContext(null);

export const useAccount = () => useContext(AccountContext);

// Up to two letters for the account button: first and last word of the name, else the
// first letter of the email. Letters only, so "Bob (Pythons)" is "BP".
export const accountInitials = (name, email) => {
  const words = String(name || "").match(/\p{L}[\p{L}\p{M}'’-]*/gu) || [];
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  const fromEmail = String(email || "").match(/\p{L}/u);
  return fromEmail ? fromEmail[0].toUpperCase() : "";
};
