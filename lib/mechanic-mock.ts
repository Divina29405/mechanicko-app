export type SosIssue = 'Flat tire' | 'Dead battery' | 'Overheat' | 'Engine stall';

export type SosOffer = {
  id: string;
  issue: SosIssue;
  distanceKm: number;
  secondsLeft: number;
  customerName: string;
  vehicle: string;
  etaMinutes: number;
};

export type Booking = {
  id: string;
  time: string;
  clientName: string;
  vehicle: string;
  service: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  status: 'scheduled' | 'active' | 'done';
};

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  packed: boolean;
  neededFor: string;
};

export type PayoutRow = {
  id: string;
  label: string;
  amount: number;
  date: string;
  method: 'GCash' | 'Bank';
  status: 'completed' | 'pending';
};

export type ChatThread = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  kind: 'client' | 'support';
};

export type JobHistoryItem = {
  id: string;
  service: string;
  clientName: string;
  date: string;
  amount: number;
  rating: number;
  feedback: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

export const initialSosOffer: SosOffer = {
  id: 'sos-1',
  issue: 'Flat tire',
  distanceKm: 1.8,
  secondsLeft: 45,
  customerName: 'Marco Dela Cruz',
  vehicle: 'Honda Click 150i',
  etaMinutes: 8,
};

export const initialBookings: Booking[] = [
  {
    id: 'b1',
    time: '10:30 AM',
    clientName: 'Ana Reyes',
    vehicle: 'Toyota Vios 2021',
    service: 'Oil Change',
    address: '24 Mabini St, Makati',
    phone: '09171234567',
    lat: 14.5547,
    lng: 121.0244,
    status: 'scheduled',
  },
  {
    id: 'b2',
    time: '1:15 PM',
    clientName: 'Paolo Santos',
    vehicle: 'Mitsubishi Mirage',
    service: 'Brake Service',
    address: 'BGC High Street, Taguig',
    phone: '09187654321',
    lat: 14.5515,
    lng: 121.051,
    status: 'scheduled',
  },
  {
    id: 'b3',
    time: '4:00 PM',
    clientName: 'Liza Gomez',
    vehicle: 'Yamaha NMAX',
    service: 'CVT Cleaning',
    address: 'Katipunan Ave, QC',
    phone: '09998887766',
    lat: 14.637,
    lng: 121.074,
    status: 'scheduled',
  },
];

export const initialInventory: InventoryItem[] = [
  { id: 'i1', name: 'Jack + lug wrench', qty: 1, packed: true, neededFor: 'SOS / gulong' },
  { id: 'i2', name: 'Jump pack', qty: 1, packed: true, neededFor: 'Dead battery' },
  { id: 'i3', name: '5W-30 oil (4L)', qty: 2, packed: true, neededFor: 'Oil change ni Ana' },
  { id: 'i4', name: 'Oil filter', qty: 2, packed: false, neededFor: 'Oil change ni Ana' },
  { id: 'i5', name: 'Brake pads (front)', qty: 1, packed: false, neededFor: 'Brake service ni Paolo' },
  { id: 'i6', name: 'Coolant 1L', qty: 3, packed: true, neededFor: 'Overheat SOS' },
];

export const initialPayouts: PayoutRow[] = [
  { id: 'p1', label: 'Weekly payout', amount: 8450, date: 'Sep 29', method: 'GCash', status: 'completed' },
  { id: 'p2', label: 'SOS bonus', amount: 350, date: 'Oct 2', method: 'GCash', status: 'completed' },
  { id: 'p3', label: 'Pending cashout', amount: 2100, date: 'Oct 3', method: 'Bank', status: 'pending' },
];

export const initialThreads: ChatThread[] = [
  {
    id: 'c1',
    name: 'Ana Reyes',
    preview: 'Nasa basement parking ako, Vios na puti.',
    time: '9:12 AM',
    unread: 2,
    kind: 'client',
  },
  {
    id: 'c2',
    name: 'Marco Dela Cruz',
    preview: 'Nasa tapat ng 7-Eleven, EDSA Cubao.',
    time: 'Ngayon',
    unread: 1,
    kind: 'client',
  },
  {
    id: 'c3',
    name: 'Mechaniko Support',
    preview: 'Na-verify na ang bagong sertipikasyon mo.',
    time: 'Kahapon',
    unread: 0,
    kind: 'support',
  },
];

export const initialHistory: JobHistoryItem[] = [
  {
    id: 'h1',
    service: 'Dead battery jump',
    clientName: 'Rico Tan',
    date: 'Oct 2 · 7:40 PM',
    amount: 650,
    rating: 5,
    feedback: 'Mabilis dumating, maayos magpaliwanag.',
  },
  {
    id: 'h2',
    service: 'Oil change',
    clientName: 'Bea Lim',
    date: 'Oct 2 · 11:00 AM',
    amount: 1800,
    rating: 5,
    feedback: 'Malinis ang work area, on time.',
  },
  {
    id: 'h3',
    service: 'Flat tire',
    clientName: 'Jon Cruz',
    date: 'Oct 1 · 9:20 PM',
    amount: 450,
    rating: 4,
    feedback: 'Okay, medyo traffic lang sa daan.',
  },
];

export const initialNotifications: AppNotification[] = [
  {
    id: 'n1',
    title: 'SOS malapit sa iyo',
    body: 'May motoristang flat tire 1.8 km ang layo. 45s para i-grab.',
    time: 'Ngayon',
    read: false,
  },
  {
    id: 'n2',
    title: 'Admin',
    body: 'Updated ang payout schedule: tuwing Lunes via GCash.',
    time: '2h',
    read: false,
  },
  {
    id: 'n3',
    title: 'System',
    body: 'I-update ang emergency kit checklist bago mag-shift.',
    time: 'Kahapon',
    read: true,
  },
];

export function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH')}`;
}
