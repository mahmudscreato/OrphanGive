import { Hr } from "@react-email/components";
import { tokens } from "./EmailLayout";

export function EmailDivider({ spacing = 24 }: { spacing?: number } = {}) {
  return (
    <Hr
      style={{
        border: "none",
        borderTop: `1px solid ${tokens.border}`,
        margin: `${spacing}px 0`,
      }}
    />
  );
}

export default EmailDivider;
