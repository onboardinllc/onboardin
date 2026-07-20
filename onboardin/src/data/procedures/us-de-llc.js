import { legalTemplateUrl } from '../../lib/template-urls.js';

export const US_DE_LLC = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for each member / registered agent.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one of these is accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing passport. Must be valid (not expired).' }] },
                { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued driver\'s license with photo is accepted.' }] },
                { label: 'State ID', time: 'Varies', cost: 'Varies', steps: [{ action: 'A government-issued state or national ID card with photo is accepted.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Delaware Registered Agent',
        icon: 'ph-map-pin',
        desc: 'A physical Delaware address to receive legal documents. Required by state law.',
        required: true,
        process: {
            title: 'Appoint a Delaware Registered Agent',
            pick: 'Choose a registered agent service:',
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Go to Northwest Registered Agent and select Delaware as your state.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest Registered Agent' },
                        { action: 'Purchase the registered agent service. You receive a Delaware address immediately.' },
                        { action: 'Use this address as your Registered Agent address on your Certificate of Formation.' },
                    ],
                },
                {
                    label: 'ZenBusiness ($199/yr bundled)',
                    time: 'Instant',
                    cost: '$199/year (includes formation filing)',
                    steps: [
                        { action: 'ZenBusiness handles both the registered agent and the Certificate of Formation filing.', url: 'https://www.zenbusiness.com', cta: 'ZenBusiness' },
                        { action: 'Select Delaware LLC formation. Registered agent is included.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Certificate of Formation',
        icon: 'ph-file-text',
        desc: 'Filed with Delaware Division of Corporations to create your LLC.',
        required: true,
        process: {
            title: 'File your Certificate of Formation (Delaware)',
            pick: null,
            tracks: [
                {
                    label: 'Online via Delaware eCorp (standard)',
                    time: '3 to 5 business days standard. Expedited: 24-hour ($50), same-day ($100).',
                    cost: '$200 filing fee (effective Aug 1, 2026 under HB 400; previously $110). Certified copy: $50 extra.',
                    steps: [
                        { action: 'Go to the Delaware Division of Corporations eCorp filing portal.', url: 'https://corp.delaware.gov', cta: 'Delaware eCorp portal' },
                        { action: 'Upload your completed Certificate of Formation (Form 18-201). Required fields: LLC name (must include "LLC" or "L.L.C."), name and address of your Registered Agent, and name/address of the organizer.' },
                        { action: 'Pay the $200 filing fee online. Select expedited processing if needed (24-hour: $50 surcharge, same-day: $100 surcharge, 2-hour: $500 surcharge).' },
                        { action: 'You receive a stamped "Filed" copy of your Certificate and a Filing Memo. Download and save both. Upload the stamped Certificate here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'operating_agreement',
        label: 'Operating Agreement',
        icon: 'ph-handshake',
        desc: 'Internal governance document. Not filed with the state but required for banking.',
        required: true,
        templateUrl: legalTemplateUrl('llc_operating_agreement'),
        fillEnabled: true,
        process: {
            title: 'Draft your LLC Operating Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin LLC Operating Agreement template.', url: legalTemplateUrl('llc_operating_agreement'), cta: 'Download template' },
                        { action: 'Fill in: member names, ownership percentages, voting rules (majority or unanimous), management structure (member-managed or manager-managed), and capital contributions.' },
                        { action: 'Add a buyout clause defining what happens if a member wants to leave or dies.' },
                        { action: 'All members sign the agreement. This is a private document. Do not file it with Delaware.' },
                        { action: 'Your bank will ask for this when you open the business account. Upload a signed copy here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS Employer Identification Number. Required for banking and tax filings.',
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
                        { action: 'Go to the IRS EIN Online Assistant. Available Monday to Friday 7 AM  to  10 PM ET.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Limited Liability Company" as your entity type, then your state of formation (Delaware).' },
                        { action: 'Enter the responsible party\'s SSN or ITIN. Complete the online form.' },
                        { action: 'Your EIN is displayed immediately on screen. Download the CP 575 confirmation letter and upload it here.' },
                    ],
                },
                {
                    label: 'By fax (international founders, 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4 (Rev. Dec 2025 or later) from the IRS.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'On Line 7b, write "Foreign" (since you have no SSN). Line 7a must be a natural person\'s name as the Responsible Party.' },
                        { action: 'Fax the completed form to: +1-304-707-9471 (International fax line). Include a return fax number on the cover sheet.' },
                        { action: 'You receive your EIN by fax within 4 business days. The physical CP 575 letter arrives by mail in 4 to 6 weeks. Upload whichever you receive first.' },
                    ],
                },
                {
                    label: 'By phone (international founders, immediate)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Call the IRS international EIN line: +1-267-941-1099. Available Monday to Friday 6 AM  to  11 PM ET.' },
                        { action: 'Have your completed Form SS-4 in front of you. The agent will ask for the information on the form and issue your EIN verbally during the call.' },
                        { action: 'Write down the EIN immediately. The CP 575 confirmation letter arrives by mail in 4 to 6 weeks.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership Information report. Foreign-formed entities only as of 2026.',
        required: false,
        process: {
            title: 'Beneficial Ownership Information (BOI) Report',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR. Domestic US entities not reporting companies',
                    time: 'N/A for domestic LLCs',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic U.S.-formed LLCs are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor fincen.gov/boi for the final rule.' },
                        { action: 'If your LLC was formed outside the US and registered to do business in the US: you must file within 30 days of registration.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'us_annual_tax',
        label: 'Delaware Annual Franchise Tax',
        icon: 'ph-calendar-check',
        desc: 'Delaware LLC flat annual tax. Due June 1 each year.',
        required: true,
        process: {
            title: 'Pay Delaware LLC Annual Tax',
            pick: null,
            tracks: [
                {
                    label: 'Online at Delaware eCorp',
                    time: 'Immediate payment / due June 1',
                    cost: '$300/year flat (increasing to $400 for 2026 tax year, payable 2027).',
                    steps: [
                        { action: 'Delaware LLCs pay a flat annual tax of $300. No annual report form is required. Only the payment.' },
                        { action: 'Pay by June 1 each year at the Delaware Division of Corporations payment portal.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                        { action: 'Late payments incur a $200 penalty plus 1.5% monthly interest. Pay on time.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account. Required for accepting payments and filing taxes.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for startups / remote founders)',
                    time: '1 to 3 business days',
                    cost: 'Free. No minimum balance, no monthly fees.',
                    steps: [
                        { action: 'Apply online at Mercury. No branch visit required. Accepts international founders with a US LLC.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Certificate of Formation, EIN confirmation, government ID for all owners over 25%, and your Operating Agreement.' },
                        { action: 'Account typically approved in 1 to 3 business days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Relay (good for multi-account setups)',
                    time: '2 to 4 business days',
                    cost: 'Free. No minimum balance.',
                    steps: [
                        { action: 'Apply at Relay. Designed for small businesses and startups.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: Certificate of Formation, EIN, government ID.' },
                        { action: 'Supports up to 20 sub-accounts. Useful for separating operating cash, payroll, and tax reserves.' },
                    ],
                },
                {
                    label: 'Novo (fast, app-first)',
                    time: '1 to 2 business days',
                    cost: 'Free.',
                    steps: [
                        { action: 'Apply at Novo. Strong integration with Stripe and Shopify.', url: 'https://www.novo.co', cta: 'Novo bank' },
                        { action: 'Provide: EIN, Certificate of Formation, owner ID.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering equity, vesting, IP assignment.',
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
                        { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff is standard), and role.' },
                        { action: 'Review the IP assignment clause. All work done for the company belongs to the company.' },
                        { action: 'All founders sign. If co-founders are in multiple countries, DocuSign is sufficient.' },
                        { action: 'Upload the signed agreement here.' },
                    ],
                },
            ],
        },
    },
];

// ─── US DELAWARE C-CORP ───────────────────────────────────────────────────────

