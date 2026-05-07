import { Button } from "@react-email/components";
import { tokens } from "./EmailLayout";

type Props = {
  href: string;
  children: React.ReactNode;
};

export function EmailButton({ href, children }: Props) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: tokens.tangerine,
        color: tokens.cream,
        fontFamily: tokens.sans,
        fontSize: "15px",
        fontWeight: 600,
        textDecoration: "none",
        padding: "12px 24px",
        borderRadius: "8px",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}

export default EmailButton;
