import { Link } from '@tanstack/react-router';

export function PageMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-[20px] font-semibold">{title}</h1>
      {body && <p className="mt-2 text-[13px] text-ink-2">{body}</p>}
      <Link to="/" className="mt-4 inline-block text-[13px] text-slate">
        Back to plumbing projects
      </Link>
    </div>
  );
}
