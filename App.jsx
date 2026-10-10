import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, Bell, CheckCircle2, ChevronDown, Clock3, Droplet, Heart, HeartHandshake, Hospital, LocateFixed, LogIn, LogOut, MapPin, Menu, Navigation, Plus, Radio, Search, ShieldCheck, Siren, Users, X } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const ROLES = [
  { id: 'patient', label: 'Patient', icon: Heart, desc: 'Request blood and track responses' },
  { id: 'donor', label: 'Donor', icon: Droplet, desc: 'Respond to nearby requests' },
  { id: 'nss_volunteer', label: 'NSS volunteer', icon: Users, desc: 'Coordinate community support' },
  { id: 'blood_bank', label: 'Blood bank', icon: Hospital, desc: 'Support urgent blood needs' },
];
const roleLabel = (r) => ROLES.find(x => x.id === r)?.label || r || 'Member';
const timeLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('raktha_user') || 'null'); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem('raktha_token') || '');
  const [page, setPage] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [role, setRole] = useState('patient');
  const [form, setForm] = useState({ name: '', email: '', password: '', bloodGroup: 'O+', phone: '', latitude: '17.9784', longitude: '79.5941' });
  const [request, setRequest] = useState({ bloodGroup: 'O+', unitsNeeded: '1', latitude: '17.9784', longitude: '79.5941', hospital: 'MGM Hospital, Warangal', phone: '', notes: '' });
  const [spoQuery, setSpoQuery] = useState({ lat: '17.9784', lng: '79.5941', blood: 'O+' });
  const [spoResults, setSpoResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [notifications, setNotifications] = useState([{ id: 1, type: 'SYSTEM READY', text: 'RakthaSetu emergency network is ready.', time: timeLabel() }]);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [simSpeed, setSimSpeed] = useState(1);
  const [escalated, setEscalated] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const notify = (text, type = 'UPDATE') => { setNotice({ text, type }); setTimeout(() => setNotice(null), 3800); };
  const pushActivity = (text, type = 'UPDATE') => setNotifications(prev => [{ id: Date.now() + Math.random(), type, text, time: timeLabel() }, ...prev].slice(0, 12));
  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateRequest = (key, value) => setRequest(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!user?.id) return;
    const source = new EventSource(`${API_BASE}/api/notifications/stream/${user.id}`);
    source.onmessage = (event) => { try { const payload = JSON.parse(event.data); pushActivity(payload.message || 'A new notification arrived.', payload.type || 'ALERT'); } catch { /* ignore malformed event */ } };
    source.onerror = () => source.close();
    return () => source.close();
  }, [user?.id]);

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(prev => Math.max(0, prev - simSpeed)), 1000);
    return () => clearInterval(timer);
  }, [timerActive, timeLeft, simSpeed]);
  useEffect(() => {
    if (timeLeft === 0 && timerActive) {
      setTimerActive(false); setEscalated(true);
      pushActivity('Response window expired. Escalation simulation triggered for the 20 km network.', 'ESCALATION');
      notify('Escalation simulation triggered.');
    }
  }, [timeLeft, timerActive]);

  const handleAuth = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const payload = authMode === 'login' ? { email: form.email, password: form.password } : { ...form, role, latitude: Number(form.latitude), longitude: Number(form.longitude) };
      const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Authentication failed');
      setUser(data.user); setToken(data.token || ''); localStorage.setItem('raktha_user', JSON.stringify(data.user)); if (data.token) localStorage.setItem('raktha_token', data.token);
      setPage(data.user.role === 'patient' ? 'request' : 'overview'); pushActivity(`${data.user.name} signed in.`, 'ACCOUNT'); notify(`Welcome, ${data.user.name}.`);
    } catch (err) { notify(err.message.includes('Failed to fetch') ? `Cannot reach backend at ${API_BASE}. Check that your backend is deployed and VITE_API_URL is set.` : err.message, 'ERROR'); }
    finally { setLoading(false); }
  };

  const signOut = () => { setUser(null); setToken(''); localStorage.removeItem('raktha_user'); localStorage.removeItem('raktha_token'); setPage('overview'); notify('You have signed out.'); };
  const useMyLocation = (target = 'request') => {
    if (!navigator.geolocation) return notify('Location is not supported by this browser.', 'ERROR');
    navigator.geolocation.getCurrentPosition(pos => {
      const latitude = pos.coords.latitude.toFixed(6), longitude = pos.coords.longitude.toFixed(6);
      if (target === 'request') setRequest(prev => ({ ...prev, latitude, longitude })); else setSpoQuery(prev => ({ ...prev, lat: latitude, lng: longitude }));
      notify('Location coordinates added.');
    }, () => notify('Location permission was not granted. Enter coordinates manually.', 'ERROR'), { enableHighAccuracy: true, timeout: 10000 });
  };

  const handleSpoSearch = async (e) => {
    e?.preventDefault(); setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/spo/match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: Number(spoQuery.lat), longitude: Number(spoQuery.lng), requiredBloodGroup: spoQuery.blood }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Search failed');
      setSpoResults(data.donors || []); pushActivity(`Location matching completed: ${data.totalMatched || 0} eligible responders found.`, 'MATCHING');
      notify(`${data.totalMatched || 0} eligible responder(s) found within 20 km.`);
    } catch (err) { notify(err.message.includes('Failed to fetch') ? 'Cannot reach the matching API. Connect the backend to search registered responders.' : err.message, 'ERROR'); setSpoResults([]); }
    finally { setSearching(false); }
  };

  const createRequest = async (e) => {
    e.preventDefault(); if (!user?.id) { setPage('auth'); setAuthMode('login'); return notify('Please sign in as a patient to submit a request.'); }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/requests/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ requesterId: user.id, patientName: user.name, bloodGroup: request.bloodGroup, unitsNeeded: Number(request.unitsNeeded), latitude: Number(request.latitude), longitude: Number(request.longitude), hospital: request.hospital, phone: request.phone || user.phone, notes: request.notes }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.message || data.error || 'Could not create request');
      pushActivity(`Emergency request created for ${request.bloodGroup}.`, 'REQUEST CREATED'); notify('Request created. Matching responders have been alerted.'); setPage('overview');
    } catch (err) { notify(err.message.includes('Failed to fetch') ? 'Backend is unreachable. Deploy/connect the API before creating real requests.' : err.message, 'ERROR'); }
    finally { setLoading(false); }
  };

  const acceptRequest = async (requestId) => {
    if (!user?.id) return notify('Sign in to accept a request.', 'ERROR');
    try { const res = await fetch(`${API_BASE}/api/requests/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ requestId, donorId: user.id }) }); const data = await res.json(); if (!res.ok) throw new Error(data.message || data.error || 'Unable to accept request'); pushActivity('You accepted a blood request.', 'ACCEPTED'); notify('Request accepted. Please coordinate with the patient.'); }
    catch (err) { notify(err.message, 'ERROR'); }
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const matchedCount = spoResults.length;
  const isPatient = user?.role === 'patient';

  return <div className="app-shell">
    <div className="emergency-strip"><span className="live-dot"/><Siren size={15}/><span className="strip-label">RAKTHASETU RESPONSE NETWORK</span><span className="strip-message">Connecting urgent blood needs with nearby helping hands.</span><span className="strip-live"><span/> SYSTEM ONLINE</span></div>
    <header className="topbar"><button className="brand" onClick={() => setPage('overview')}><span className="brand-mark"><HeartHandshake size={25}/></span><span className="brand-copy"><strong>Raktha<span>Setu</span></strong><small>EVERY DROP CONNECTS A LIFE</small></span></button>
      <nav className={`main-nav ${mobileMenu ? 'nav-open' : ''}`}><button className={page === 'overview' ? 'nav-active' : ''} onClick={() => {setPage('overview');setMobileMenu(false)}}>Overview</button><button className={page === 'request' ? 'nav-active' : ''} onClick={() => {setPage('request');setMobileMenu(false)}}>Request blood</button><button className={page === 'matcher' ? 'nav-active' : ''} onClick={() => {setPage('matcher');setMobileMenu(false)}}>Find responders</button><button className={page === 'simulator' ? 'nav-active' : ''} onClick={() => {setPage('simulator');setMobileMenu(false)}}>Escalation demo</button></nav>
      <div className="top-actions">{user ? <><span className="user-chip"><span className="avatar">{(user.name || 'R').slice(0,1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></span><ChevronDown size={14}/></span><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={17}/></button></> : <button className="btn btn-primary btn-small" onClick={() => {setPage('auth');setAuthMode('login')}}><LogIn size={15}/> Sign in</button>}<button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X/> : <Menu/>}</button></div>
    </header>

    <main className="page-wrap">
      {page === 'overview' && <>
        <section className="hero"><div className="hero-content"><div className="eyebrow"><span className="eyebrow-icon"><Activity size={14}/></span> COMMUNITY-POWERED EMERGENCY RESPONSE</div><h1>When every minute<br/>matters, <span>we connect.</span></h1><p className="hero-desc">A smarter way to bring patients, blood donors, NSS volunteers and blood banks together — right when help is needed most.</p><div className="hero-buttons"><button className="btn btn-primary btn-large" onClick={() => setPage('request')}><Droplet size={18} fill="currentColor"/> Request blood now <ArrowRight size={17}/></button><button className="btn btn-outline btn-large" onClick={() => {setRole('donor');setPage('auth');setAuthMode('signup')}}><Heart size={17}/> Join as a donor</button></div><div className="trust-row"><span><ShieldCheck size={15}/> Privacy-first coordination</span><span><MapPin size={15}/> 20 km response radius</span></div></div><div className="hero-visual"><div className="hero-glow"/><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-heart"><Heart size={57} fill="currentColor" strokeWidth={1.3}/><span className="heart-pulse"/></div><div className="float-card float-top"><span className="float-icon"><MapPin size={17}/></span><span><strong>Nearby responders</strong><small>Ranked by distance</small></span><span className="tiny-status">LIVE</span></div><div className="float-card float-bottom"><span className="float-icon green"><CheckCircle2 size={18}/></span><span><strong>Help is on the way</strong><small>One connection at a time</small></span></div><div className="visual-caption"><span className="visual-line"/>ONE NETWORK. MANY LIVES.</div></div></section>
        <section className="stats-grid"><Stat icon={Users} label="Responder network" value="4 roles" sub="One connected community"/><Stat icon={Navigation} label="Matching radius" value="20 km" sub="Distance-aware matching"/><Stat icon={Clock3} label="Response workflow" value="24/7*" sub="Designed for urgent needs"/><Stat icon={ShieldCheck} label="Privacy focus" value="Protected" sub="Contact details shared carefully"/></section>
        <section className="section-block"><div className="section-heading"><div><div className="eyebrow">GET STARTED</div><h2>One platform. Four ways to help.</h2><p>Choose the role that best describes you.</p></div><button className="text-link" onClick={() => setPage('auth')}>Explore accounts <ArrowRight size={15}/></button></div><div className="role-grid">{ROLES.map((r, i) => <button key={r.id} className="role-card" onClick={() => {setRole(r.id);setPage('auth');setAuthMode('signup')}}><div className={`role-symbol role-${i}`}><r.icon size={23}/></div><div className="role-card-text"><h3>{r.label}</h3><p>{r.desc}</p></div><span className="role-arrow"><ArrowDownRight size={19}/></span><span className="role-index">0{i+1}</span></button>)}</div></section>
        <section className="section-block process-block"><div className="section-heading"><div><div className="eyebrow">HOW IT WORKS</div><h2>From urgent need to helping hand.</h2><p>A clear, trackable journey from request to response.</p></div></div><div className="process-grid"><Process n="01" title="Raise a request" text="Share the required blood group and the hospital location." icon={Siren}/><Process n="02" title="Match nearby" text="Find eligible responders within the 20 km search radius." icon={LocateFixed}/><Process n="03" title="Alert the network" text="Notify responders and surface the request in their dashboard." icon={Bell}/><Process n="04" title="Escalate if needed" text="If no response arrives, move to the next response step." icon={Radio}/></div></section>
        <section className="bottom-cta"><div className="cta-icon"><HeartHandshake size={28}/></div><div><h2>Someone nearby could be someone's hope.</h2><p>Register to be part of a faster, more connected response network.</p></div><button className="btn btn-white" onClick={() => {setRole('donor');setPage('auth');setAuthMode('signup')}}>Become a responder <ArrowRight size={16}/></button></section>
      </>}

      {page === 'auth' && <section className="auth-layout"><div className="auth-aside"><div className="eyebrow light"><ShieldCheck size={14}/> YOUR COMMUNITY, CONNECTED</div><h1>Small action.<br/><span>Life-changing</span><br/>impact.</h1><p>Create an account to join the RakthaSetu response network and help make emergency coordination simpler.</p><div className="auth-benefit"><span><CheckCircle2 size={17}/></span><div><strong>Role-based access</strong><small>Personalized experience for every member</small></div></div><div className="auth-benefit"><span><CheckCircle2 size={17}/></span><div><strong>Nearby matching</strong><small>Find eligible responders within 20 km</small></div></div><div className="auth-art-heart"><Heart size={100} fill="currentColor"/></div></div><div className="auth-card"><div className="auth-card-head"><span className="mini-brand"><HeartHandshake size={20}/></span><div><h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{authMode === 'login' ? 'Sign in to continue to RakthaSetu.' : 'Join the network. Every helping hand matters.'}</p></div></div><div className="auth-toggle"><button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Sign in</button><button className={authMode === 'signup' ? 'selected' : ''} onClick={() => setAuthMode('signup')}>Create account</button></div><form onSubmit={handleAuth} className="form-stack">{authMode === 'signup' && <Field label="Full name"><input required value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Enter your full name"/></Field>}<Field label="Email address"><input type="email" required value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="you@example.com" autoComplete="email"/></Field><Field label="Password"><input type="password" minLength="6" required value={form.password} onChange={e => updateForm('password', e.target.value)} placeholder="At least 6 characters" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}/></Field>{authMode === 'signup' && <><Field label="I am joining as"><select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field><div className="form-two"><Field label="Blood group"><select value={form.bloodGroup} onChange={e => updateForm('bloodGroup', e.target.value)}>{GROUPS.map(g => <option key={g}>{g}</option>)}</select></Field><Field label="Mobile number"><input value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="Optional"/></Field></div><div className="form-two"><Field label="Latitude"><input type="number" step="any" required value={form.latitude} onChange={e => updateForm('latitude', e.target.value)}/></Field><Field label="Longitude"><input type="number" step="any" required value={form.longitude} onChange={e => updateForm('longitude', e.target.value)}/></Field></div><button type="button" className="location-link" onClick={() => {if (!navigator.geolocation) return notify('Location is not supported.', 'ERROR');navigator.geolocation.getCurrentPosition(p => {updateForm('latitude', p.coords.latitude);updateForm('longitude', p.coords.longitude);notify('Location added.')}, () => notify('Please allow location access or enter coordinates manually.', 'ERROR'))}}><LocateFixed size={15}/> Use my current location</button></>}<button className="btn btn-primary submit-btn" disabled={loading}>{loading ? 'Please wait…' : authMode === 'login' ? 'Sign in securely' : 'Create my account'} <ArrowRight size={17}/></button></form><p className="form-note"><ShieldCheck size={14}/> Your information should only be used for response coordination.</p></div></section>}

      {page === 'request' && <section className="workspace"><PageHeading eyebrow="PATIENT SERVICES" title="Request blood" desc="Create an urgent request and connect with nearby eligible responders." badge="20 km radius"/><div className="workspace-grid"><div className="surface-card"><div className="card-title-row"><div className="card-title-icon"><Droplet size={21}/></div><div><h2>Emergency blood request</h2><p>Complete the details below to begin matching.</p></div></div>{!user && <div className="inline-alert"><ShieldCheck size={18}/><div><strong>Sign in to submit a real request</strong><p>You can fill the form now, then sign in or create an account to submit it.</p><button className="text-link" onClick={() => setPage('auth')}>Sign in / Register <ArrowRight size={14}/></button></div></div>}<form onSubmit={createRequest} className="form-stack"><div className="form-two"><Field label="Required blood group *"><select required value={request.bloodGroup} onChange={e => updateRequest('bloodGroup', e.target.value)}>{GROUPS.map(g => <option key={g}>{g}</option>)}</select></Field><Field label="Units required"><select value={request.unitsNeeded} onChange={e => updateRequest('unitsNeeded', e.target.value)}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'unit' : 'units'}</option>)}</select></Field></div><Field label="Hospital / medical facility *"><input required value={request.hospital} onChange={e => updateRequest('hospital', e.target.value)} placeholder="Hospital name and area"/></Field><Field label="Patient / coordinator mobile"><input value={request.phone} onChange={e => updateRequest('phone', e.target.value)} placeholder="Contact number"/></Field><Field label="Additional details"><textarea rows="3" value={request.notes} onChange={e => updateRequest('notes', e.target.value)} placeholder="Urgency, preferred time, or coordination notes"/></Field><div className="form-two"><Field label="Latitude *"><input type="number" step="any" required value={request.latitude} onChange={e => updateRequest('latitude', e.target.value)}/></Field><Field label="Longitude *"><input type="number" step="any" required value={request.longitude} onChange={e => updateRequest('longitude', e.target.value)}/></Field></div><button type="button" className="location-link" onClick={() => useMyLocation('request')}><LocateFixed size={15}/> Use my current location</button><button className="btn btn-primary submit-btn" disabled={loading}><Siren size={17}/> {loading ? 'Submitting request…' : 'Submit emergency request'} <ArrowRight size={16}/></button><p className="form-note">Please verify details before submitting. The service coordinates assistance but cannot guarantee blood availability.</p></form></div><aside className="side-column"><div className="surface-card radius-card"><div className="radius-visual"><div className="radius-ring ring-outer"/><div className="radius-ring ring-mid"/><div className="radius-ring ring-inner"/><span className="radius-center"><MapPin size={23}/></span><span className="map-pin pin-a">♥</span><span className="map-pin pin-b">D</span><span className="map-pin pin-c">+</span></div><h3>Local response radius</h3><p>Eligible responders are searched within <strong>20 kilometres</strong> of the request location.</p><div className="radius-meta"><span><i className="legend-red"/> Request location</span><span><i className="legend-gray"/> Potential responders</span></div></div><div className="surface-card privacy-card"><ShieldCheck size={22}/><div><h3>Privacy matters</h3><p>Contact details should only be revealed to an authorized responder after acceptance.</p></div></div></aside></div></section>}

      {page === 'matcher' && <section className="workspace"><PageHeading eyebrow="LOCATION INTELLIGENCE" title="Find nearby responders" desc="Search the registered network by blood group and coordinates." badge="Haversine · 20 km"/><div className="workspace-grid"><div className="surface-card"><div className="card-title-row"><div className="card-title-icon"><Navigation size={21}/></div><div><h2>Responder matching</h2><p>Eligible results are sorted by distance, nearest first.</p></div></div><form onSubmit={handleSpoSearch} className="form-stack"><Field label="Required blood group"><select value={spoQuery.blood} onChange={e => setSpoQuery(p => ({...p,blood:e.target.value}))}>{GROUPS.map(g => <option key={g}>{g}</option>)}</select></Field><div className="form-two"><Field label="Latitude"><input type="number" step="any" required value={spoQuery.lat} onChange={e => setSpoQuery(p => ({...p,lat:e.target.value}))}/></Field><Field label="Longitude"><input type="number" step="any" required value={spoQuery.lng} onChange={e => setSpoQuery(p => ({...p,lng:e.target.value}))}/></Field></div><button type="button" className="location-link" onClick={() => useMyLocation('matcher')}><LocateFixed size={15}/> Use my current location</button><button className="btn btn-primary submit-btn" disabled={searching}><Search size={17}/>{searching ? 'Searching network…' : 'Search within 20 km'} <ArrowRight size={16}/></button></form><div className="results-heading"><div><h3>Matching responders</h3><p>{matchedCount} result{matchedCount === 1 ? '' : 's'} returned from backend</p></div><span className="result-count">{matchedCount}</span></div>{spoResults.length ? <div className="responder-list">{spoResults.map((d,i) => <div className="responder-row" key={d.id || d._id || i}><div className="responder-avatar">{d.role === 'blood_bank' ? <Hospital size={20}/> : d.role === 'nss_volunteer' ? <Users size={20}/> : <Droplet size={20}/>}</div><div className="responder-info"><div className="responder-name">{d.name}<span className="blood-tag">{d.bloodGroup || 'Support'}</span></div><p>{roleLabel(d.role)} · <MapPin size={12}/> {d.distanceKm} km away</p></div><span className="distance-tag">{d.distanceKm} km</span></div>)}</div> : <div className="empty-state"><div><Search size={23}/></div><strong>No results to display yet</strong><p>Enter a location and search the registered responder network.</p></div>}</div><aside className="side-column"><div className="surface-card matching-info"><span className="info-icon"><Activity size={21}/></span><h3>How matching works</h3><p>The server checks blood group compatibility, responder availability and straight-line distance.</p><div className="info-step"><b>01</b><span>Check blood group compatibility</span></div><div className="info-step"><b>02</b><span>Measure distance from request</span></div><div className="info-step"><b>03</b><span>Sort eligible responders by proximity</span></div></div><div className="surface-card mini-note"><ShieldCheck size={19}/><p>Matching is a coordination aid only. Final transfusion compatibility must be determined by qualified medical professionals.</p></div></aside></div></section>}

      {page === 'simulator' && <section className="workspace"><PageHeading eyebrow="RESPONSE RELIABILITY" title="Escalation simulator" desc="Demonstrate what happens when an initial response window expires." badge="Demo environment"/><div className="sim-grid"><div className="surface-card timer-card"><div className="timer-header"><div className="card-title-icon amber"><Clock3 size={22}/></div><div><h2>Primary response window</h2><p>Simulated 25-minute response deadline</p></div><span className={`status-badge ${escalated ? 'status-red' : 'status-wait'}`}>{escalated ? 'ESCALATED' : 'AWAITING RESPONSE'}</span></div><div className={`timer-display ${escalated ? 'timer-danger' : ''}`}><span className="timer-caption">TIME REMAINING</span><strong>{formatTime(timeLeft)}</strong><div className="timer-track"><span style={{width: `${(timeLeft/(25*60))*100}%`}}/></div><p>{escalated ? 'The response window has expired.' : 'If no confirmation arrives, the workflow moves to its escalation step.'}</p></div><div className="timer-controls">{!timerActive ? <button className="btn btn-primary" onClick={() => {if(timeLeft===0)setTimeLeft(25*60);setEscalated(false);setTimerActive(true)}}><Radio size={16}/> Start simulation</button> : <button className="btn btn-outline" onClick={() => setTimerActive(false)}>Pause timer</button>}<button className="btn btn-outline" onClick={() => setSimSpeed(s => s===1?50:1)}><Activity size={16}/>{simSpeed}× speed</button><button className="btn btn-danger-soft" onClick={() => {setTimeLeft(0);setTimerActive(true)}}>Force escalation</button><button className="btn btn-quiet" onClick={() => {setTimerActive(false);setTimeLeft(25*60);setEscalated(false)}}>Reset</button></div>{escalated && <div className="escalation-result"><div><Siren size={20}/></div><section><strong>Escalation event simulated</strong><p>The interface has recorded an escalation event. Production escalation must be handled by the backend and should notify the next eligible responder based on the configured policy.</p></section></div>}</div><div className="surface-card timeline-card"><div className="card-title-row"><div className="card-title-icon"><Activity size={21}/></div><div><h2>Response timeline</h2><p>Latest events in this browser session</p></div></div><div className="timeline-list">{notifications.slice(0,7).map((n,i)=><div className="timeline-item" key={n.id}><span className={`timeline-dot ${i===0?'dot-current':''}`}/><div><strong>{n.type}</strong><p>{n.text}</p><small>{n.time}</small></div></div>)}</div></div></div></section>}
    </main>

    <footer className="site-footer"><div className="footer-brand"><span className="brand-mark small-mark"><HeartHandshake size={18}/></span><strong>RakthaSetu</strong><span>·</span><span>Every drop connects a life.</span></div><div className="footer-right"><span><span className="footer-dot"/> Built for faster blood coordination</span><span>© {new Date().getFullYear()} RakthaSetu</span></div></footer>
    {notice && <div className={`toast ${notice.type === 'ERROR' ? 'toast-error' : ''}`}><span className="toast-icon">{notice.type === 'ERROR' ? <X size={17}/> : <CheckCircle2 size={17}/>}</span><span>{notice.text}</span><button onClick={() => setNotice(null)}><X size={15}/></button></div>}
  </div>;
}

function Stat({icon:Icon,label,value,sub}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18}/></span></div><strong>{value}</strong><small>{sub}</small></div>; }
function Process({n,title,text,icon:Icon}) { return <div className="process-card"><div className="process-top"><span className="process-icon"><Icon size={20}/></span><span className="process-num">{n}</span></div><h3>{title}</h3><p>{text}</p></div>; }
function Field({label,children}) { return <label className="field"><span>{label}</span>{children}</label>; }
function PageHeading({eyebrow,title,desc,badge}) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div><span className="heading-badge"><span/> {badge}</span></div>; }
