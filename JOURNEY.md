# Customer Journey Map - Promobi

This document outlines the end-to-end customer journey for Promobi's Translation and Notarization services.

## 1. Discovery & Entry
**Goal:** Build trust instantly and guide user to the right service.

- **Touchpoint:** Landing Page (`/`)
- **Key Interactions:**
  - Hero Section with "Trust Badges" (USCIS, ATA, Florida Notary).
  - Clear value proposition: "Speed of Technology + Legal Precision".
  - **Action:** User clicks "Start Order" or scrolls to Calculator.

## 2. Service Selection & Configuration
**Goal:** Frictionless quote generation and file intake.

- **Touchpoint:** Interactive Calculator (Home)
- **Flows:**
  - **A. Certified Translation:**
    - User uploads PDF/Image.
    - System analyzes density/pages.
    - User can add "Notarization" as an add-on.
  - **B. Remote Online Notarization (RON):**
    - User uploads "Original" + "Translated" pair (or single doc).
    - Flat fee per slot.
- **Key Interactions:**
  - Real-time price updates.
  - Urgency selection (Standard, 24h, 12h).
  - User details input (Name, Email, Phone).

## 3. Transaction
**Goal:** Secure and flexible payment processing.

- **Touchpoint:** Checkout Modal / Stripe Integration
- **Key Interactions:**
  - Payment Method Selection:
    - **USD:** Stripe (Credit Card).
    - **BRL:** ParceladoUSA (Pix / Installments).
  - Validation: Minimum order checks, incomplete file warnings.
  - **Action:** Payment Confirmation.

## 4. Fulfillment & Processing
**Goal:** Transparent progress tracking and high-quality execution.

- **Touchpoint:** Order Status Page (`/meu-pedido`) & Admin Panel
- **Processes:**
  - **Translation:**
    - Admin assigns translator.
    - Draft generated (AI + Human Edit).
    - Quality assurance review.
  - **Notarization:**
    - Integration with **BlueNotary**.
    - User receives link for video session (Biometrics + KBA).
    - Notary signs digitally during session.

## 5. Delivery
**Goal:** Secure delivery of valid legal documents.

- **Touchpoint:** Email & Download Page
- **Deliverables:**
  - **Certified PDF:** Signed, stamped, with ATA certification cover sheet.
  - **Notarized PDF:** Digital certificate embedded.
- **Action:** User downloads final files.

## 6. Retention & Advocacy
**Goal:** Repeat business and referrals.

- **Touchpoint:** Post-Delivery Email
- **Key Interactions:**
  - Request for review (Google/Trustpilot).
  - Discount code for next service.
