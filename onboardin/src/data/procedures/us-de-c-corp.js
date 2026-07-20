import { legalTemplateUrl } from '../../lib/template-urls.js';

export const US_DE_CCORP = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for all directors and officers.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one of these is accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing valid passport.' }] },
                { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued driver\'s license with photo.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Delaware Registered Agent',
        icon: 'ph-map-pin',
        desc: 'Required physical Delaware address for legal correspondence.',
        required: true,
        process: {
            title: 'Appoint a Delaware Registered Agent',
            pick: 'Choose a service:',
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Purchase the service at Northwest Registered Agent.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest' },
                        { action: 'You receive a Delaware address immediately. Use it on your Certificate of Incorporation.' },
                    ],
                },
                {
                    label: 'CT Corporation (enterprise option)',
                    time: 'Instant',
                    cost: '$299+/year',
                    steps: [
                        { action: 'Used by most VC-backed companies.', url: 'https://www.ctcorporation.com', cta: 'CT Corporation' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Certificate of Incorporation',
        icon: 'ph-file-text',
        desc: 'Filed with Delaware Division of Corporations. Creates the legal entity.',
        required: true,
        process: {
            title: 'File your Certificate of Incorporation (Delaware)',
            pick: null,
            tracks: [
                {
                    label: 'Online via Delaware eCorp',
                    time: '3 to 5 business days standard.',
                    cost: '$200 minimum filing fee (effective Aug 1, 2026). Covers up to 1,500 no-par shares. Expedited: 24-hour ($300 surcharge), same-day ($500), 2-hour ($1,500), 1-hour ($2,500).',
                    steps: [
                        { action: 'Go to the Delaware Division of Corporations filing portal.', url: 'https://corp.delaware.gov', cta: 'Delaware eCorp portal' },
                        { action: 'Prepare your Certificate of Incorporation (Stock Corporation). Required fields: corporate name (must include "Inc." or "Corp."), registered agent name and address, total authorized shares and par value, and organizer name/address.' },
                        { action: 'Standard startup structure: 10,000,000 authorized shares at $0.0001 par value. This keeps Delaware franchise tax low under the assumed par value method.' },
                        { action: 'Pay the filing fee online. Choose your processing speed.' },
                        { action: 'You receive a stamped "Filed" Certificate of Incorporation. Download and save it. Upload here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'bylaws_governance',
        label: 'Bylaws & Board Consent',
        icon: 'ph-scroll',
        desc: 'Corporate bylaws and initial board resolutions. Not filed with the state.',
        required: true,
        templateUrl: legalTemplateUrl('corp_bylaws'),
        fillEnabled: true,
        process: {
            title: 'Adopt Bylaws and Initial Board Consent',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Corporate Bylaws template.', url: legalTemplateUrl('corp_bylaws'), cta: 'Download Bylaws' },
                        { action: 'Customize: number of directors, quorum rules, meeting procedures, officer titles.' },
                        { action: 'Draft the Initial Board Consent (Organizational Minutes). This adopts the bylaws, elects officers, authorizes bank account opening, and authorizes issuance of stock.' },
                        { action: 'Directors sign the Board Consent. File in your corporate records book.' },
                        { action: 'Upload your adopted bylaws here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_stock',
        label: 'Founder Stock Issuance',
        icon: 'ph-chart-pie',
        desc: 'Stock Purchase Agreements and stock certificates for founding team.',
        required: true,
        templateUrl: legalTemplateUrl('stock_purchase_agreement'),
        fillEnabled: true,
        process: {
            title: 'Issue founder stock',
            pick: null,
            tracks: [
                {
                    label: 'Standard issuance with vesting',
                    time: '1 to 3 days',
                    cost: 'Free (template). Attorneys typically charge $1,500 to 5,000 for this.',
                    steps: [
                        { action: 'Download the Stock Purchase Agreement template.', url: legalTemplateUrl('stock_purchase_agreement'), cta: 'Download SPA' },
                        { action: 'Founders purchase stock at par value ($0.0001/share is standard). A founder buying 5,000,000 shares pays $500 total.' },
                        { action: 'Attach a 4-year vesting schedule with 1-year cliff. This means 25% vests after year one, then monthly thereafter. Standard for investor expectations.' },
                        { action: 'Attach IP assignment language. Confirm all prior work done for the company is assigned in the agreement.' },
                        { action: 'Each founder signs their SPA. The board countersigns. Issue stock certificates (even if electronic).' },
                        { action: 'File an 83(b) election within 30 days of stock issuance if shares are subject to vesting. This is critical for tax. See the 83(b) note.' },
                        { action: 'Upload signed SPAs and the board\'s stock issuance resolution here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS Employer Identification Number. Required for banking and payroll.',
        required: true,
        process: {
            title: 'Get your EIN from the IRS',
            pick: 'Choose your method:',
            tracks: [
                {
                    label: 'Online (US persons with SSN, instant)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Go to the IRS EIN Online Assistant.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Corporation" as entity type.' },
                        { action: 'Complete the form. EIN displayed immediately. Download CP 575 and upload here.' },
                    ],
                },
                {
                    label: 'By fax (international founders, 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'Write "Foreign" on Line 7b. Fax to +1-304-707-9471 with a return fax number.' },
                        { action: 'EIN arrives by fax within 4 business days.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership Information. Foreign-registered entities only in 2026.',
        required: false,
        process: {
            title: 'Beneficial Ownership Information (BOI)',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR. Domestic corps not reporting companies',
                    time: 'N/A',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic US-formed corporations are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor for final rule.' },
                        { action: 'Foreign-formed entities registered in the US must file within 30 days.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'de_franchise_tax',
        label: 'Delaware Franchise Tax',
        icon: 'ph-calendar-check',
        desc: 'Annual Delaware franchise tax for C-Corps. Due March 1.',
        required: true,
        process: {
            title: 'Pay Delaware Franchise Tax',
            pick: null,
            tracks: [
                {
                    label: 'Online at Delaware eCorp',
                    time: 'Immediate payment / due March 1',
                    cost: 'Minimum $175 (Authorized Shares Method) or $400 (Assumed Par Value Method) + $50 mandatory Annual Report fee.',
                    steps: [
                        { action: 'Delaware offers two calculation methods. Choose the lower result.' },
                        { action: 'Authorized Shares Method: $175 for 1 to 5,000 shares, $250 for 5,001 to 10,000, $85 per additional 10,000 shares above 10,000.' },
                        { action: 'Assumed Par Value Method: divide gross assets by issued shares to get assumed par value, then multiply total authorized shares × assumed par value × 0.004%. Minimum $400.' },
                        { action: 'For a startup with 10M authorized shares at $0.0001 par and $500K assets: the Assumed Par Value method typically yields far less than the Authorized Shares method. Calculate both before paying.' },
                        { action: 'Pay online at the Delaware payment portal plus the mandatory $50 Annual Report fee.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                        { action: 'Pay by March 1. Late payments incur a $200 penalty plus 1.5% monthly interest.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account for your corporation.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (startup-friendly)',
                    time: '1 to 3 business days',
                    cost: 'Free. No minimum, no monthly fees.',
                    steps: [
                        { action: 'Apply online. Accepts C-Corps and international founders.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Certificate of Incorporation, EIN, Bylaws, government ID for all owners over 25%.' },
                    ],
                },
                {
                    label: 'Brex (VC-backed startups)',
                    time: '1 to 2 business days',
                    cost: 'Free. Gives a corporate credit card with no personal guarantee.',
                    steps: [
                        { action: 'Brex is built for funded startups. Recommended if you\'re raising.', url: 'https://www.brex.com', cta: 'Brex' },
                        { action: 'Provide: Certificate of Incorporation, EIN, cap table.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering vesting, IP assignment, and co-founder terms.',
        required: true,
        templateUrl: legalTemplateUrl('founder_agreement'),
        fillEnabled: true,
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Founder Agreement template.', url: legalTemplateUrl('founder_agreement'), cta: 'Download template' },
                        { action: 'Coordinate with your Stock Purchase Agreement. The vesting terms must match.' },
                        { action: 'Ensure IP assignment covers all prior work and inventions related to the company\'s business.' },
                        { action: 'All founders sign. Upload here.' },
                    ],
                },
            ],
        },
    },
];

// ─── US WYOMING LLC ───────────────────────────────────────────────────────────

