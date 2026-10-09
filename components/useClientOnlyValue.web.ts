import { useEffect, useState } from 'react';

// `useEffect` is not invoked during server rendering, meaning
// we can use this to determine if we're on the server or not.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const [value, setValue] = useState<S | C>(server);
  useEffect(() => {
    // This intentionally switches from the server value after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(client);
  }, [client]);

  return value;
}
