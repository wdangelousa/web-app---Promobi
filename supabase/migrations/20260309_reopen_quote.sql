-- Migration: Reopen Order Quote Functionality
-- Created: 2026-03-09

-- RPC Function to safely reopen an order's quote
CREATE OR REPLACE FUNCTION reopen_order_quote(p_order_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    -- Get current status
    SELECT status::TEXT INTO v_current_status
    FROM "Order"
    WHERE id = p_order_id;

    -- Verify if order exists
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Order not found (ID: %)', p_order_id;
    END IF;

    -- Restriction: Block reopening if paid, in translation, or completed
    IF v_current_status IN ('PAID', 'READY_FOR_REVIEW', 'TRANSLATING', 'NOTARIZING', 'COMPLETED') THEN
        RAISE EXCEPTION 'Cannot reopen quote: current status is %', v_current_status;
    END IF;

    -- Only allow if it's currently in a re-openable state (e.g. pending payment or initial pending)
    -- In this system, PENDING is 'Draft/Quoting' and PENDING_PAYMENT is 'Awaiting Payment'
    IF v_current_status NOT IN ('PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION', 'CANCELLED') THEN
        RAISE EXCEPTION 'Current status (%) does not allow reopening to draft.', v_current_status;
    END IF;

    -- Update status back to PENDING (Draft/Internal Quoting phase)
    -- Also clear delivery fields to ensure a clean slate
    UPDATE "Order"
    SET 
        status = 'PENDING',
        "deliveryUrl" = NULL,
        "finalPaidAmount" = NULL,
        "extraDiscount" = 0,
        "sentAt" = NULL
    WHERE id = p_order_id;

    -- Log transition (using a simple RAISE NOTICE for now, 
    -- but ideally you'd have an AuditLog table)
    RAISE NOTICE 'Order % status reverted from % to PENDING', p_order_id, v_current_status;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
