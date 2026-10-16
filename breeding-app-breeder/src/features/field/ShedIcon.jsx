import React from "react";
import { Spiral } from "@phosphor-icons/react";

// Phosphor has no shed glyph; the spiral reads as a shed skin at icon size and stays in the
// same family as every other icon on the screen.
export default function ShedIcon(props) {
  return <Spiral {...props} />;
}
