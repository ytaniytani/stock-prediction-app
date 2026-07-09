import { useState } from "react";

// 初心者向けの用語注釈。「?」アイコンにカーソル/タップで説明が出る。
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      <span className="info-tip-icon" aria-label="用語説明">
        ?
      </span>
      {open && <span className="info-tip-popover">{text}</span>}
    </span>
  );
}
