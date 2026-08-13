export function Icon({ name, className = '' }) {
  const paths = {
    processed: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    rate: <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M21 7v6h-6" />,
    email: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M3 8v10a2 2 0 002 2h14a2 2 0 002-2V8M3 8l9-4 9 4" />,
    duplicate: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8a2 2 0 012 2v8m-2 4H6a2 2 0 01-2-2V7m4-4h8a2 2 0 012 2v2" />,
    refresh: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.3 5.3M4 15a8 8 0 0013.7 3.7" />,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}