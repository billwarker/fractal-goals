-- PostgreSQL initialization script
-- This runs automatically when the container is first created

-- Create extensions that might be useful
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant permissions (useful for cloud migration compatibility)
-- The fractal user already has full access to the fractal_goals database
-- This is a placeholder for any additional setup needed

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Fractal Goals database initialized successfully';
END $$;
