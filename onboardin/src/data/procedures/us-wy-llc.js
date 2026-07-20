import { legalTemplateUrl } from '../../lib/template-urls.js';

export const US_WY_LLC = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for all members.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing valid passport.' }] },
                { label: "Driver's License / National ID", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued photo ID is accepted.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Wyoming Registered Agent',
        icon: 'ph-map-pin',
        desc: 'Physical Wyoming address required. PO boxes not accepted.',
        required: true,
        process: {
            title: 'Appoint a Wyoming Registered Agent',
            pick: null,
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Go to Northwest Registered Agent and select Wyoming.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest' },
                        { action: 'You receive a Wyoming street address immediately. No PO boxes allowed by Wyoming law.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Articles of Organization',
        icon: 'ph-file-text',
        desc: 'Filed with Wyoming Secretary of State. Instant processing online.',
        required: true,
        process: {
            title: 'File Wyoming Articles of Organization',
            pick: null,
            tracks: [
                {
                    label: 'Online at Wyoming Secretary of State (instant)',
                    time: 'Instant to 1 business day online / 15+ business days by mail.',
                    cost: '$102 ($100 state fee + $2 online convenience fee).',
                    steps: [
                        { action: 'Go to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov/Business/FilingSearch.aspx', cta: 'WyoBiz portal' },
                        { action: 'Check name availability first. Your name must include "LLC", "L.L.C.", or "Limited Liability Company".' },
                        { action: 'File your Articles of Organization online. Required fields: LLC name, registered agent name and Wyoming street address, member/manager information, and organizer name.' },
                        { action: 'Pay $102 online. Processing is typically instant.' },
                        { action: 'Download your filed Articles. Upload here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'operating_agreement',
        label: 'Operating Agreement',
        icon: 'ph-handshake',
        desc: 'Internal governance document. Required for banking.',
        required: true,
        templateUrl: legalTemplateUrl('llc_operating_agreement'),
        fillEnabled: true,
        process: {
            title: 'Draft your Wyoming LLC Operating Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin LLC Operating Agreement template.', url: legalTemplateUrl('llc_operating_agreement'), cta: 'Download template' },
                        { action: 'Fill in: member names, ownership percentages, voting rules, and management structure.' },
                        { action: 'All members sign. Do not file with Wyoming. This is a private document.' },
                        { action: 'Upload a signed copy here for your records.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS EIN. Required for banking and taxes.',
        required: true,
        process: {
            title: 'Get your EIN from the IRS',
            pick: 'Choose your method:',
            tracks: [
                {
                    label: 'Online (US persons, instant)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply online at the IRS EIN Assistant.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Limited Liability Company" then Wyoming. Complete the form. EIN issued immediately.' },
                        { action: 'Download the CP 575 confirmation letter and upload it here.' },
                    ],
                },
                {
                    label: 'By fax (international founders, 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'Write "Foreign" on Line 7b. List a natural person on Line 7a. Fax to +1-304-707-9471.' },
                        { action: 'EIN by fax in 4 business days. Physical CP 575 arrives in 4 to 6 weeks.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership. Domestic entities currently exempt in 2026.',
        required: false,
        process: {
            title: 'BOI Report',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR. Domestic LLCs not reporting companies',
                    time: 'N/A',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic Wyoming LLCs are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor for final rule.' },
                        { action: 'Foreign-formed entities operating in the US must file within 30 days.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'wy_annual_report',
        label: 'Wyoming Annual Report',
        icon: 'ph-calendar-check',
        desc: 'Annual report and license tax. Due on the 1st of your formation month each year.',
        required: true,
        process: {
            title: 'File Wyoming Annual Report',
            pick: null,
            tracks: [
                {
                    label: 'Online at WyoBiz',
                    time: 'Due the 1st day of your formation anniversary month',
                    cost: '$62 minimum ($60 license tax + $2 online fee). Higher if assets exceed $300,000.',
                    steps: [
                        { action: 'Log in to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov', cta: 'WyoBiz portal' },
                        { action: 'File before the 1st of your formation anniversary month. A 60-day late period applies with no penalty; after 60 days, Wyoming may administratively dissolve your LLC.' },
                        { action: 'Fee: $62 minimum (up to $300K in assets). Over $300K: $0.0002 per dollar of assets.' },
                        { action: 'Report member/manager information and confirm registered agent. Pay online.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account for your Wyoming LLC.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for international founders)',
                    time: '1 to 3 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply online. Mercury accepts Wyoming LLCs with international founders.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Articles of Organization, EIN, Operating Agreement, owner ID.' },
                    ],
                },
                {
                    label: 'Relay',
                    time: '2 to 4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply at Relay.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: Articles, EIN, Operating Agreement, owner ID.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering equity, vesting, and IP assignment.',
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
                        { action: 'Download the template.', url: legalTemplateUrl('founder_agreement'), cta: 'Download template' },
                        { action: 'Fill in: equity splits, vesting schedule, IP assignment, and role definitions.' },
                        { action: 'All founders sign. Upload here.' },
                    ],
                },
            ],
        },
    },
];
