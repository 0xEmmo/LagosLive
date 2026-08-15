import { createClient } from '@supabase/supabase-js';

// Values come from the environment (e.g. .env.local) — never hardcode keys in
// committed files.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const parties = [
  ["PULSE LAGOS","Sat, Jul 5","10 PM \u2013 4 AM","Quilox Club, Victoria Island","15 Ozumba Mbadiwe Ave, Victoria Island, Lagos",6.4281,3.4219,"\u20A615,000",15000,2.3,"Club",1000,423,"18+","Smart Casual","Flytime Music","@flytime_music","+2348012345678","Lagos\u2019s most electrifying club night featuring top DJs spinning Afrobeats, Amapiano & more. 3 floors of pure energy \u2014 VIP tables available.","linear-gradient(135deg,#FF2D95 0%,#8A2BE2 100%)",true],
  ["SKYBAR SESSIONS","Fri, Jul 4","8 PM \u2013 2 AM","Eko Pearl Rooftop, VI","Block A, Eko Pearl Towers, Eko Atlantic, Lagos",6.425,3.415,"\u20A610,000",10000,1.8,"Rooftop",400,87,"21+","Cocktail Attire","Rooftop Republic","@rooftoprepublic","+2348098765432","Unwind 30 floors above Lagos with live Afro-juju fusion, premium cocktails and an unbeatable panoramic view of the Atlantic coastline.","linear-gradient(135deg,#00BFFF 0%,#8A2BE2 100%)",false],
  ["DETTY SUMMER","Sat, Jul 5","4 PM \u2013 12 AM","Eko Atlantic City, VI","Eko Atlantic City, Victoria Island Extension, Lagos",6.4071,3.4052,"\u20A625,000",25000,3.2,"Festival",5000,1243,"16+","Anything Goes","BigDreamerz","@bigdreamerz","+2348055512345","The ultimate summer festival with 10+ Afrobeats artists, food trucks, art installations and surprise headline acts. Biggest party of the year.","linear-gradient(135deg,#FFD600 0%,#FF8A00 100%)",true],
  ["UNPLUGGED VI","Sun, Jul 6","7 PM \u2013 11 PM","Terra Kulture, Victoria Island","Plot 1376 Tiamiyu Savage St, Victoria Island, Lagos",6.435,3.421,"\u20A68,000",8000,2.8,"Concert",500,312,"All Ages","Smart Casual","Terra Kulture Events","@terra_kulture","+2347011234567","Intimate acoustic concert featuring Nigeria\u2019s finest singer-songwriters. Spoken word, jazz, and highlife in a beautiful garden setting.","linear-gradient(135deg,#FF8A00 0%,#FF2D95 100%)",true],
  ["LEKKI HEAT","Sat, Jul 5","9 PM \u2013 5 AM","Lekki Phase 1, Lekki","Close 10, Lekki Phase 1, Lagos",6.45,3.48,"Free",0,5.2,"House Party",150,43,"18+","Casual","The Lekki Collective","@lekkicollective","+2348031234567","The most exclusive free house party in Lekki. RSVP required. Good music, good food, great people. Strictly by invitation only.","linear-gradient(135deg,#00F5D4 0%,#00BFFF 100%)",true],
  ["MIDNIGHT LOUNGE","Fri, Jul 4","9 PM \u2013 3 AM","The Wheatbaker, Ikoyi","4 Lawrence Road, Ikoyi, Lagos",6.4474,3.4314,"\u20A612,000",12000,4.8,"Lounge",200,67,"21+","Smart Elegant","Shelly Entertainment","@shellyentertainment","+2348067891234","Ultra-premium lounge experience with live jazz, signature cocktails and an intimate atmosphere for the discerning Lagos socialite.","linear-gradient(135deg,#8A2BE2 0%,#00BFFF 100%)",false],
  ["AFROWAVE","Sat, Jul 5","11 PM \u2013 6 AM","Club 57, Ikeja GRA","57 Mobolaji Bank Anthony Way, Ikeja, Lagos",6.6018,3.3515,"\u20A67,000",7000,12.3,"Club",600,289,"18+","Anything Goes","Afrowave Promotions","@afrowave_ng","+2348023456789","Mainland\u2019s hottest club night! Multiple rooms, different sounds \u2014 Afrobeats, Hip Hop, Dancehall. 2 for 1 drinks before midnight.","linear-gradient(135deg,#FF2D95 0%,#8A2BE2 100%)",true],
  ["STELLAR CONCERT","Sat, Jul 5","8 PM \u2013 12 AM","Eko Hotel & Suites, VI","Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos",6.433,3.4213,"\u20A630,000",30000,2.1,"Concert",3000,876,"All Ages","Cocktail","Kennis Music","@kennismusic","+2348034567890","Premium concert experience with A-list Afrobeats artists at the iconic Eko Hotel. VIP, VVIP and Regular packages available.","linear-gradient(135deg,#FF8A00 0%,#FF2D95 100%)",true],
  ["MAINLAND MADNESS","Sun, Jul 6","3 PM \u2013 10 PM","National Arts Theatre, Surulere","King George V Rd, Surulere, Lagos",6.5008,3.3658,"\u20A65,000",5000,8.7,"Festival",2000,567,"All Ages","Street Style","Mainland Republic","@mainlandrepublic","+2348045678901","A cultural festival celebrating mainland Lagos \u2014 music, food, art and fashion. From Fuji to Afrobeats, everything is here.","linear-gradient(135deg,#FFD600 0%,#FF8A00 100%)",true],
  ["ALT\u00c9 PICNIC","Sun, Jul 6","2 PM \u2013 8 PM","University of Lagos, Yaba","University Road, Akoka, Yaba, Lagos",6.5156,3.3793,"Free",0,7.4,"House Party",300,128,"All Ages","Creative/Artistic","Alt\u00e9 Nation","@alte_nation","+2348056789012","A free-spirited picnic for Lagos creatives. Live art, experimental music, poetry, and the best jollof in the city. BYOB welcome.","linear-gradient(135deg,#00F5D4 0%,#00BFFF 100%)",true],
  ["HARBOUR NIGHTS","Fri, Jul 4","8 PM \u2013 2 AM","Harbour Point, Victoria Island","4 Wilmot Point Rd, Victoria Island, Lagos",6.42,3.415,"\u20A615,000",15000,3,"Lounge",300,89,"25+","Smart Elegant","Harbour Social Club","@harboursocialclub","+2348067890123","Exclusive seafront lounge night with panoramic Lagos Harbour views. House & Afro House music. Tables must be reserved in advance.","linear-gradient(135deg,#8A2BE2 0%,#00BFFF 100%)",false],
  ["VIBEZ 57","Fri, Jul 4","11 PM \u2013 5 AM","Club 57, Victoria Island","57 Adeola Odeku St, Victoria Island, Lagos",6.432,3.42,"\u20A610,000",10000,2.5,"Club",700,234,"18+","Smart Casual","Vibez Entertainment","@vibez_entertainment","+2348078901234","Friday night at VI\u2019s most iconic club. Resident DJs + international guest act. Ladies free before midnight with RSVP.","linear-gradient(135deg,#FF2D95 0%,#8A2BE2 100%)",false],
];

const startsAt = new Date();
startsAt.setHours(22, 0, 0, 0);
const endsAt = new Date();
endsAt.setHours(4, 0, 0, 0);

const now = new Date().toISOString();

const rows = parties.map((p) => ({
  title: p[0], date: p[1], time: p[2], location: p[3], address: p[4],
  lat: p[5], lng: p[6], fee: p[7], fee_num: p[8], distance: p[9],
  vibe: p[10], capacity: p[11], spots_left: p[12], age_restriction: p[13],
  dress_code: p[14], organizer: p[15], instagram: p[16], whatsapp: p[17],
  description: p[18], gradient: p[19], is_weekend: p[20],
  starts_at: startsAt.toISOString(),
  ends_at: endsAt.toISOString(),
  status: 'approved',
  created_at: now,
  updated_at: now,
}));

const { data, error } = await supabase.from('parties').insert(rows).select();
if (error) {
  console.error('Seed failed:', error.message);
} else {
  console.log('Seeded ' + data.length + ' parties successfully!');
}
