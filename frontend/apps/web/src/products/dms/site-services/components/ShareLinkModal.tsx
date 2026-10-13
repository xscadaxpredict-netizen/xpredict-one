import { XIcon, CopyIcon, MessageCircleIcon, ShareIcon } from "lucide-react";
import styles from "./ShareLinkModal.module.css";
import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  link: string;
  onClose: () => void;
}

export function ShareLinkModal({ isOpen, link, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`Please review and sign this service report:\n\n${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Service Report Signature',
        text: 'Please review and sign this service report:',
        url: link,
      }).catch(console.error);
    } else {
      alert("Native sharing is not supported on this browser. Please copy the link instead.");
    }
  };

  const hasNativeShare = Boolean(navigator.share);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Share Signature Link</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        
        <div className={styles.body}>
          <p className={styles.subtitle}>
            Share this link with the client. They will be able to review the report and provide their signature.
          </p>
          
          <div className={styles.linkBox}>
            <input type="text" className={styles.linkInput} value={link} readOnly />
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "Copied!" : <><CopyIcon size={16} /> Copy</>}
            </button>
          </div>
          
          <div className={styles.actions}>
            <button className={styles.actionBtn} style={{ backgroundColor: '#25D366', color: 'white' }} onClick={handleWhatsApp}>
              <MessageCircleIcon size={18} /> Send via WhatsApp
            </button>
            {hasNativeShare && (
              <button className={styles.actionBtn} style={{ backgroundColor: '#3B82F6', color: 'white' }} onClick={handleNativeShare}>
                <ShareIcon size={18} /> Share Options
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
