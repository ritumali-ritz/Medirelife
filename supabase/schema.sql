-- ==============================================================================
-- MedRelief (Campus Edition) - Supabase Cloud PostgreSQL Database Schema
-- Pure Non-Profit Campus Medicine Redistribution Platform
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    roll_number TEXT NOT NULL UNIQUE,
    division TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 2. MEDICINE DONATIONS TABLE
CREATE TABLE IF NOT EXISTS public.medicine_donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    drug_name TEXT NOT NULL,
    brand_name TEXT,
    quantity_strips INTEGER NOT NULL DEFAULT 1 CHECK (quantity_strips > 0),
    expiry_date DATE NOT NULL,
    photo_url TEXT,
    ocr_raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'REQUESTED' 
        CHECK (status IN ('REQUESTED', 'COLLECTED', 'PHARMACIST_VERIFIED', 'REJECTED', 'NGO_HANDOVER_COMPLETED')),
    drop_off_point TEXT DEFAULT 'Campus Dispensary Drop-Box',
    seal_condition TEXT DEFAULT 'SEALED_INTACT'
        CHECK (seal_condition IN ('SEALED_INTACT', 'PARTIALLY_OPEN', 'UNSEALED')),
    collector_id TEXT,
    collected_at TIMESTAMPTZ,
    pharmacist_notes TEXT,
    rejection_reason TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 3. DONATION TIMELINES TABLE (Milestone audit & notification tracker)
CREATE TABLE IF NOT EXISTS public.donation_timelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_id UUID NOT NULL REFERENCES public.medicine_donations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    sms_sent BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE,
    sms_details JSONB DEFAULT '{}'::jsonb,
    email_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 4. NGO CLAIMS TABLE (Non-monetary distribution records)
CREATE TABLE IF NOT EXISTS public.ngo_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ngo_name TEXT NOT NULL,
    representative TEXT NOT NULL,
    proof_photo_url TEXT,
    signature_url TEXT,
    notes TEXT,
    claimed_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'HANDOVER_COMPLETED' 
        CHECK (status IN ('HANDOVER_COMPLETED', 'PENDING_PICKUP'))
);

-- 5. NGO CLAIM ITEMS (Junction table linking claims to donations)
CREATE TABLE IF NOT EXISTS public.ngo_claim_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES public.ngo_claims(id) ON DELETE CASCADE,
    donation_id UUID NOT NULL REFERENCES public.medicine_donations(id) ON DELETE CASCADE,
    CONSTRAINT unique_claimed_donation UNIQUE (donation_id)
);

-- ==============================================================================
-- INDEXES FOR HIGH-THROUGHPUT REALTIME QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_donations_student_id ON public.medicine_donations(student_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON public.medicine_donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_expiry ON public.medicine_donations(expiry_date);
CREATE INDEX IF NOT EXISTS idx_timelines_donation_id ON public.donation_timelines(donation_id);
CREATE INDEX IF NOT EXISTS idx_ngo_claim_items_claim_id ON public.ngo_claim_items(claim_id);

-- ==============================================================================
-- SUPABASE STORAGE BUCKET CONFIGURATION
-- Buckets: /prescriptions, /donation-proofs
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('prescriptions', 'prescriptions', true),
    ('donation-proofs', 'donation-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for public read and authenticated/service upload
CREATE POLICY "Public read for prescriptions bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'prescriptions');

CREATE POLICY "Allow uploads to prescriptions bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'prescriptions');

CREATE POLICY "Public read for donation-proofs bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'donation-proofs');

CREATE POLICY "Allow uploads to donation-proofs bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'donation-proofs');

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngo_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngo_claim_items ENABLE ROW LEVEL SECURITY;

-- Allow public reads and inserts for the campus extension demonstration
CREATE POLICY "Allow public read access to students"
    ON public.students FOR SELECT USING (true);
CREATE POLICY "Allow public insert to students"
    ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to students"
    ON public.students FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to donations"
    ON public.medicine_donations FOR SELECT USING (true);
CREATE POLICY "Allow public insert to donations"
    ON public.medicine_donations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to donations"
    ON public.medicine_donations FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to timelines"
    ON public.donation_timelines FOR SELECT USING (true);
CREATE POLICY "Allow public insert to timelines"
    ON public.donation_timelines FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to claims"
    ON public.ngo_claims FOR SELECT USING (true);
CREATE POLICY "Allow public insert to claims"
    ON public.ngo_claims FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to claim items"
    ON public.ngo_claim_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert to claim items"
    ON public.ngo_claim_items FOR INSERT WITH CHECK (true);

-- ==============================================================================
-- AUTOMATIC TIMELINE GENERATION TRIGGER
-- Whenever a donation status updates, auto-record a milestone timeline event
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_donation_status_update()
RETURNS TRIGGER AS $$
DECLARE
    msg TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        msg := 'Surplus medicine drop-off requested at ' || COALESCE(NEW.drop_off_point, 'Campus Hub') || '. Package awaiting campus collector pickup.';
        INSERT INTO public.donation_timelines (donation_id, status, message, sms_sent, email_sent)
        VALUES (NEW.id, 'REQUESTED', msg, TRUE, TRUE);
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.status = 'COLLECTED' THEN
            msg := 'Package safely collected from ' || COALESCE(NEW.drop_off_point, 'drop-off point') || ' by Campus Volunteer. En route to Pharmacy Inspection Hub.';
        ELSIF NEW.status = 'PHARMACIST_VERIFIED' THEN
            msg := 'Inspected & Approved by Licensed Pharmacist. Blister seals verified intact, expiry validated (' || NEW.expiry_date || '). Stock placed in active non-profit pool.';
        ELSIF NEW.status = 'REJECTED' THEN
            msg := 'Audited by Pharmacist: Package flagged for safe medical disposal. Reason: ' || COALESCE(NEW.rejection_reason, 'Failed seal or expiry inspection');
        ELSIF NEW.status = 'NGO_HANDOVER_COMPLETED' THEN
            msg := 'Donation successfully handed over to partner NGO for free charitable distribution to underprivileged patients. Delivery proof & digital signature logged.';
        ELSE
            msg := 'Donation status updated to ' || NEW.status;
        END IF;

        INSERT INTO public.donation_timelines (donation_id, status, message, sms_sent, email_sent)
        VALUES (NEW.id, NEW.status, msg, TRUE, TRUE);
        
        NEW.updated_at := TIMEZONE('utc', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_donation_timeline ON public.medicine_donations;
CREATE TRIGGER trg_donation_timeline
AFTER INSERT OR UPDATE OF status ON public.medicine_donations
FOR EACH ROW EXECUTE FUNCTION public.handle_donation_status_update();

-- Enable Supabase Realtime publication for live WebSocket streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.medicine_donations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.donation_timelines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ngo_claims;

