-- =============================================================================
-- MedRelief Cloud Database Schema for Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/dhkitaftpuqewfarqmeh/sql
-- =============================================================================

-- 1. DROP-BOX LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.drop_boxes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    building TEXT NOT NULL,
    hours TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS & Allow public read/write for demo
ALTER TABLE public.drop_boxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on drop_boxes" ON public.drop_boxes FOR ALL USING (true) WITH CHECK (true);

-- Insert Default Campus Drop-Boxes
INSERT INTO public.drop_boxes (id, name, building, hours)
VALUES 
  ('loc-1', 'Campus Central Library Foyer', 'Central Library Building, Ground Floor', '08:00 AM - 08:00 PM'),
  ('loc-2', 'Student Health Center Lobby', 'Health & Wellness Pavilion', '09:00 AM - 05:00 PM'),
  ('loc-3', 'Main Academic Block A Foyer', 'Academic Complex, North Wing', '08:30 AM - 06:30 PM'),
  ('loc-4', 'Student Hostel Complex Hub', 'Residential Quadrangle Gate 2', '24 Hours Accessible')
ON CONFLICT (id) DO NOTHING;


-- 2. STUDENTS / DONORS TABLE
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    roll_number TEXT UNIQUE NOT NULL,
    division TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on students" ON public.students FOR ALL USING (true) WITH CHECK (true);


-- 3. MEDICINE DONATIONS TABLE
CREATE TABLE IF NOT EXISTS public.donations (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    brand_name TEXT,
    drug_name TEXT NOT NULL,
    quantity_strips INTEGER DEFAULT 1,
    expiry_date DATE NOT NULL,
    drop_off_point TEXT NOT NULL,
    photo_url TEXT,
    status TEXT DEFAULT 'REQUESTED', -- 'REQUESTED', 'COLLECTED', 'PHARMACIST_VERIFIED', 'REJECTED', 'NGO_HANDOVER_COMPLETED'
    pharmacist_notes TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on donations" ON public.donations FOR ALL USING (true) WITH CHECK (true);


-- 4. CUSTODY TIMELINES TABLE
CREATE TABLE IF NOT EXISTS public.timelines (
    id TEXT PRIMARY KEY,
    donation_id TEXT REFERENCES public.donations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.timelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on timelines" ON public.timelines FOR ALL USING (true) WITH CHECK (true);


-- 5. FEEDBACK / REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.feedback (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    roll_number TEXT,
    email TEXT,
    rating INTEGER DEFAULT 5,
    category TEXT DEFAULT 'General Experience',
    message TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on feedback" ON public.feedback FOR ALL USING (true) WITH CHECK (true);

-- Insert Default Initial Feedback
INSERT INTO public.feedback (id, name, roll_number, email, rating, category, message, avatar)
VALUES
  ('fb-1', 'ChandraKanta Das', '2024-MCA-014', 'ck.das@campus.edu', 5, 'Donation Process', 'MedRelief made donating surplus medicines so seamless. The in-browser OCR scanner extracted my strip details instantly and drop-box pickup gave full tracking!', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'),
  ('fb-2', 'Sakil Ahmed', 'Tech Hackers', 'sakil@tech.org', 5, 'Drop-Box Convenience', 'This campus circular healthcare initiative is phenomenal. Knowing unused medicines go directly to verified NGOs instead of landfills gives real purpose.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80'),
  ('fb-3', 'Mangesh Patil', 'Roll 87', 'mangesh@campus.edu', 5, 'NGO Partner Experience', 'I think this is the best innovative thinking out of the box. Pure zero monetization with complete clinical audit transparency!', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80')
ON CONFLICT (id) DO NOTHING;


-- 6. PARTNER NGOS TABLE
CREATE TABLE IF NOT EXISTS public.ngos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    focus TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ngos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on ngos" ON public.ngos FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.ngos (id, name, focus, contact_person, phone, email, address)
VALUES
  ('ngo-1', 'Jan Swasthya Clinic Network', 'Rural Medical Camps & Slum Clinics', 'Dr. S. K. Mehta', '+91 98220 11223', 'contact@janswastya.org', 'Sector 14, Community Center, Pune'),
  ('ngo-2', 'Red Cross Mobile Health Wing', 'Mobile Medical Vans & Geriatric Care', 'Ms. Ananya Sharma', '+91 98901 44556', 'pune@redcrossindia.org', 'Camp Area, Near General Hospital, Pune')
ON CONFLICT (id) DO NOTHING;
