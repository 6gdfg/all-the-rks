type NoticeProps = {
  notice?: string;
  error?: string;
};

export function Notice({ notice, error }: NoticeProps) {
  if (!notice && !error) {
    return null;
  }

  return (
    <div className={error ? "notice notice-error" : "notice"}>
      {error || notice}
    </div>
  );
}
