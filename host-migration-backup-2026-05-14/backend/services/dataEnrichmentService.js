import axios from "axios";
import { fetchCarrierByDotOrMc as fetchFromFMCSA } from "./fmcsaService.js";
import { verifyEmailAddress } from "./emailVerificationService.js";
import {
  enrichFromGoogleMaps,
  enrichFromOpenStreetMap,
  enrichFromYellowPages,
  enrichFromBBB,
  enrichFromPublicRecords,
  enrichFromPhoneLookup,
  getAvailableFreeServices
} from "./freeDataEnrichmentService.js";

/**
 * Enhanced data enrichment service that combines FREE sources first, then premium services
 * 
 * FREE Services (No signup, always available):
 * - FMCSA (free with webkey)
 * - Google Maps (100k requests/month free)
 * - OpenStreetMap (unlimited, free)
 * - Yellow Pages (free scraping)
 * - Better Business Bureau (free scraping)
 * - Public Records (free scraping)
 * - Data.gov (free government data)
 * 
 * PREMIUM Services (Optional, only if configured):
 * - Hunter.io, Apollo.io, ZoomInfo, RocketReach, Clearbit
 */

// API Configuration - Set these in .env
const DATA_SOURCES_CONFIG = {
  hunterIO: process.env.HUNTER_IO_API_KEY,
  apollo: process.env.APOLLO_API_KEY,
  zoominfo: process.env.ZOOMINFO_API_KEY,
  rocketreach: process.env.ROCKETREACH_API_KEY,
  clearbit: process.env.CLEARBIT_API_KEY
};

// Mock data sources - Replace with actual API calls to real services
const mockCarrierDatabase = {
  "1234567": {
    email: "dispatch@abctrucking.com",
    phone: "(555) 123-4567",
    address: "123 Main St, Columbus, OH 43215",
    website: "www.abctrucking.com"
  },
  "2345678": {
    email: "info@xyztransport.com",
    phone: "(555) 234-5678",
    address: "456 Oak Ave, Memphis, TN 38103",
    website: "www.xyztransport.com"
  },
  "3456789": {
    email: "contact@quickhaul.com",
    phone: "(555) 345-6789",
    address: "789 Pine Rd, Dallas, TX 75201",
    website: "www.quickhaul.com"
  }
};

/**
 * ============================================
 * FMCSA - FREE with WebKey
 * ============================================
 * Official DOT carrier data - safety ratings, insurance expiration
 */
export async function enrichFromFMCSA(dot, mc) {
  try {
    const fmcsaData = await fetchFromFMCSA({ dot, mc });
    const emailVerification = fmcsaData.email
      ? await verifyEmailAddress(fmcsaData.email)
      : null;

    return {
      source: "FMCSA",
      data: {
        carrierName: fmcsaData.carrierName,
        dot: fmcsaData.dot,
        mc: fmcsaData.mc,
        safetyRating: fmcsaData.safetyRating,
        safetyRatingDate: fmcsaData.safetyRatingDate,
        authorityStatus: fmcsaData.authorityStatus || null,
        operatingStatus: fmcsaData.operatingStatus || null,
        operatingAuthority: fmcsaData.operatingAuthority || null,
        insuranceExpiration: fmcsaData.insuranceExpiration,
        cargo: fmcsaData.cargo,
        email: fmcsaData.email || null,
        emailSource: fmcsaData.email ? "FMCSA MCS-150 self-reported" : null,
        emailVerification,
        emailVerified: Boolean(emailVerification?.verified),
        phone: fmcsaData.phone || null,
        address: fmcsaData.address || null,
        daysInOperation: fmcsaData.daysInOperation || null,
        vehicles: fmcsaData.vehicleCount ?? fmcsaData.vehicles ?? null,
        vehicleCount: fmcsaData.vehicleCount ?? fmcsaData.vehicles ?? null,
        drivers: fmcsaData.driverCount ?? fmcsaData.drivers ?? null,
        driverCount: fmcsaData.driverCount ?? fmcsaData.drivers ?? null,
        mcs150Date: fmcsaData.mcs150Date || null,
        totalInspections: fmcsaData.totalInspections || null,
        crashTotal: fmcsaData.crashTotal || null,
        crashes: fmcsaData.crashes || null,
        hazmatAuthorized: Boolean(fmcsaData.hazmatAuthorized),
        smsSafety: fmcsaData.smsSafety || null,
        saferData: fmcsaData.saferData || null,
        safetySource: fmcsaData.smsSafety?.source || fmcsaData.source || "FMCSA"
      },
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error("FMCSA enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * HUNTER.IO - Email Finding
 * Sign up: https://hunter.io
 * ============================================
 * Finds business emails by domain and person name
 */
export async function enrichFromHunterIO(domain, carrierName) {
  if (!DATA_SOURCES_CONFIG.hunterIO) {
    console.warn("Hunter.io API key not configured");
    return null;
  }

  try {
    const response = await axios.get("https://api.hunter.io/v2/email-finder", {
      params: {
        domain,
        full_name: carrierName,
        api_key: DATA_SOURCES_CONFIG.hunterIO
      }
    });

    if (response.data.data && response.data.data.email) {
      return {
        source: "Hunter.io",
        data: {
          email: response.data.data.email,
          confidence: response.data.data.confidence,
          verified: response.data.data.verification?.result === "verified"
        },
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error("Hunter.io enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * APOLLO.IO - B2B Sales Intelligence
 * Sign up: https://apollo.io
 * ============================================
 * Comprehensive email, phone, and company data
 */
export async function enrichFromApollo(carrierName, dot) {
  if (!DATA_SOURCES_CONFIG.apollo) {
    console.warn("Apollo.io API key not configured");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api.apollo.io/v1/contacts/search",
      {
        q_organization_name: carrierName,
        person_titles: ["Dispatcher", "Owner", "Manager"],
        api_key: DATA_SOURCES_CONFIG.apollo
      }
    );

    if (response.data.contacts && response.data.contacts.length > 0) {
      const contact = response.data.contacts[0];
      return {
        source: "Apollo.io",
        data: {
          email: contact.email,
          phone: contact.phone_numbers?.[0],
          address: contact.sanitized_organization?.headquarters_address,
          website: contact.sanitized_organization?.website_url,
          industry: contact.sanitized_organization?.industry,
          companySize: contact.sanitized_organization?.estimated_num_employees
        },
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error("Apollo.io enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * ZOOMINFO - Business Intelligence Database
 * Sign up: https://www.zoominfo.com/api
 * ============================================
 * Premium business data and decision maker information
 */
export async function enrichFromZoomInfo(carrierName, state) {
  if (!DATA_SOURCES_CONFIG.zoominfo) {
    console.warn("ZoomInfo API key not configured");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api.zoominfo.com/v2/companies/search",
      {
        q: carrierName,
        state,
        limit: 1
      },
      {
        headers: {
          Authorization: `Bearer ${DATA_SOURCES_CONFIG.zoominfo}`
        }
      }
    );

    if (response.data.companies && response.data.companies.length > 0) {
      const company = response.data.companies[0];
      return {
        source: "ZoomInfo",
        data: {
          email: company.email,
          phone: company.phone,
          address: `${company.street}, ${company.city}, ${company.state} ${company.zip}`,
          website: company.website,
          employees: company.employeeCount,
          revenue: company.annualRevenue
        },
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error("ZoomInfo enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * ROCKETREACH - Contact Intelligence
 * Sign up: https://rocketreach.co
 * ============================================
 * Comprehensive contact and professional data
 */
export async function enrichFromRocketReach(carrierName) {
  if (!DATA_SOURCES_CONFIG.rocketreach) {
    console.warn("RocketReach API key not configured");
    return null;
  }

  try {
    const response = await axios.post(
      "https://api.rocketreach.co/v2/organizations/search",
      {
        query: carrierName,
        limit: 1
      },
      {
        headers: {
          Authorization: `Bearer ${DATA_SOURCES_CONFIG.rocketreach}`
        }
      }
    );

    if (response.data.organizations && response.data.organizations.length > 0) {
      const org = response.data.organizations[0];
      
      // Get decision makers
      const people = org.people || [];
      const decisionMaker = people.find(p => 
        p.job_title?.toLowerCase().includes("dispatcher") ||
        p.job_title?.toLowerCase().includes("owner") ||
        p.job_title?.toLowerCase().includes("manager")
      ) || people[0];

      return {
        source: "RocketReach",
        data: {
          email: decisionMaker?.email,
          phone: decisionMaker?.phone || org.phone,
          address: org.address,
          website: org.website,
          linkedinUrl: decisionMaker?.linkedin_url,
          decisionMaker: {
            name: decisionMaker?.name,
            title: decisionMaker?.job_title
          }
        },
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error("RocketReach enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * CLEARBIT - Real-Time Business Data
 * Sign up: https://clearbit.com
 * ============================================
 * Real-time company and person data
 */
export async function enrichFromClearbit(domain, email) {
  if (!DATA_SOURCES_CONFIG.clearbit) {
    console.warn("Clearbit API key not configured");
    return null;
  }

  try {
    // Company lookup
    let companyData = null;
    if (domain) {
      const companyResponse = await axios.get(
        `https://api.clearbit.com/v1/companies/find?domain=${domain}`,
        {
          auth: {
            username: DATA_SOURCES_CONFIG.clearbit,
            password: ""
          }
        }
      );
      companyData = companyResponse.data.company;
    }

    // Person lookup
    let personData = null;
    if (email) {
      const personResponse = await axios.get(
        `https://api.clearbit.com/v1/people/find?email=${email}`,
        {
          auth: {
            username: DATA_SOURCES_CONFIG.clearbit,
            password: ""
          }
        }
      );
      personData = personResponse.data.person;
    }

    return {
      source: "Clearbit",
      data: {
        email: personData?.email || email,
        phone: companyData?.phone,
        address: companyData?.location,
        website: companyData?.url,
        logo: companyData?.logo,
        industry: companyData?.industry,
        tags: companyData?.tags,
        person: {
          name: personData?.name?.fullName,
          title: personData?.employment?.title,
          seniority: personData?.employment?.seniority
        }
      },
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error("Clearbit enrichment failed:", err.message);
    return null;
  }
}

/**
 * ============================================
 * Local Database - Fallback/Demo Data
 * ============================================
 */
export async function enrichFromLocalDatabase(carrierName, dot) {
  try {
    const mockData = mockCarrierDatabase[dot];
    
    if (mockData) {
      return {
        source: "Local Database",
        data: {
          email: mockData.email,
          phone: mockData.phone,
          address: mockData.address,
          website: mockData.website
        },
        timestamp: new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error("Local database enrichment failed:", err.message);
    return null;
  }
}

/**
 * Master enrichment function - combines ALL sources
 * FREE sources first, then premium (if configured)
 * Returns unified carrier data with contact information from best available sources
 * 
 * Priority order (FREE first):
 * 1. FMCSA (official, free, always try)
 * 2. Google Maps (free tier - 100k/month)
 * 3. OpenStreetMap (unlimited, free)
 * 4. Yellow Pages (free scraping)
 * 5. Better Business Bureau (free scraping)
 * 6. Public Records (free scraping)
 * 7. Hunter.io (premium - if configured)
 * 8. Apollo.io (premium - if configured)
 * 9. ZoomInfo (premium - if configured)
 * 10. RocketReach (premium - if configured)
 * 11. Clearbit (premium - if configured)
 * 12. Local Database (fallback)
 */
export async function enrichCarrierData(dot, mc, carrierName, domain) {
  try {
    const enrichedData = {
      dot,
      mc,
      carrierName,
      fmcsaData: null,
      googleMapsData: null,
      openStreetMapData: null,
      yellowPagesData: null,
      bbbData: null,
      publicRecordsData: null,
      apolloData: null,
      hunterioData: null,
      zoomInfoData: null,
      rocketreachData: null,
      clearbitData: null,
      primaryContact: null,
      alternateContacts: [],
      dataSources: [],
      freeSourcesUsed: [],
      premiumSourcesUsed: [],
      dataQuality: {
        emailVerified: false,
        phoneVerified: false,
        addressVerified: false
      }
    };

    console.log(`[Enrichment] Starting enrichment for: ${carrierName} (DOT: ${dot}, MC: ${mc})`);

    // ============================================
    // FREE SOURCES - Use Promise.allSettled to handle failures gracefully
    // Skip unreliable free scrapers (Yellow Pages, BBB, Public Records)
    // They often get blocked and timeout
    // ============================================
    const freeSourceResults = await Promise.allSettled([
      enrichFromFMCSA(dot, mc),
      enrichFromGoogleMaps(carrierName, ""),
      enrichFromOpenStreetMap(carrierName)
      // Removed: Yellow Pages, BBB, Public Records (unreliable/blocked)
    ]);

    // Extract results safely
    const [fmcsaResult, googleMapsResult, osmResult] = freeSourceResults.map(r => 
      r.status === 'fulfilled' ? r.value : null
    );

    // Process FREE results
    if (fmcsaResult) {
      enrichedData.fmcsaData = fmcsaResult.data;
      enrichedData.dataSources.push("FMCSA");
      enrichedData.freeSourcesUsed.push("FMCSA");
      if (fmcsaResult.data.emailVerification) {
        enrichedData.dataQuality.emailVerified = Boolean(fmcsaResult.data.emailVerification.verified);
      }
      if (fmcsaResult.data.phone) enrichedData.dataQuality.phoneVerified = true;
      if (fmcsaResult.data.address) enrichedData.dataQuality.addressVerified = true;
    }

    if (googleMapsResult) {
      enrichedData.googleMapsData = googleMapsResult.data;
      enrichedData.dataSources.push("Google Maps");
      enrichedData.freeSourcesUsed.push("Google Maps");
    }

    if (osmResult) {
      enrichedData.openStreetMapData = osmResult.data;
      enrichedData.dataSources.push("OpenStreetMap");
      enrichedData.freeSourcesUsed.push("OpenStreetMap");
    }

    // ============================================
    // PREMIUM SOURCES - Use allSettled for graceful failure handling
    // Only try if API keys are configured
    // ============================================
    if (DATA_SOURCES_CONFIG.hunterIO || DATA_SOURCES_CONFIG.apollo || DATA_SOURCES_CONFIG.zoominfo || DATA_SOURCES_CONFIG.rocketreach || DATA_SOURCES_CONFIG.clearbit) {
      console.log("[Enrichment] Trying premium sources (Hunter, Apollo, ZoomInfo, RocketReach, Clearbit)...");
      
      const premiumSourceResults = await Promise.allSettled([
        DATA_SOURCES_CONFIG.hunterIO ? enrichFromHunterIO(domain, carrierName) : Promise.resolve(null),
        DATA_SOURCES_CONFIG.apollo ? enrichFromApollo(carrierName, dot) : Promise.resolve(null),
        DATA_SOURCES_CONFIG.zoominfo ? enrichFromZoomInfo(carrierName, "") : Promise.resolve(null),
        DATA_SOURCES_CONFIG.rocketreach ? enrichFromRocketReach(carrierName) : Promise.resolve(null),
        DATA_SOURCES_CONFIG.clearbit ? enrichFromClearbit(domain, null) : Promise.resolve(null)
      ]);

      const [hunterResult, apolloResult, zoomResult, rocketResult, clearbitResult] = premiumSourceResults.map(r => 
        r.status === 'fulfilled' ? r.value : null
      );

      if (hunterResult) {
        enrichedData.hunterioData = hunterResult.data;
        enrichedData.dataSources.push("Hunter.io");
        enrichedData.premiumSourcesUsed.push("Hunter.io");
        console.log("[Enrichment] ✅ Hunter.io succeeded");
      }

      if (apolloResult) {
        enrichedData.apolloData = apolloResult.data;
        enrichedData.dataSources.push("Apollo.io");
        enrichedData.premiumSourcesUsed.push("Apollo.io");
        console.log("[Enrichment] ✅ Apollo.io succeeded");
      }

      if (zoomResult) {
        enrichedData.zoomInfoData = zoomResult.data;
        enrichedData.dataSources.push("ZoomInfo");
        enrichedData.premiumSourcesUsed.push("ZoomInfo");
        console.log("[Enrichment] ✅ ZoomInfo succeeded");
      }

      if (rocketResult) {
        enrichedData.rocketreachData = rocketResult.data;
        enrichedData.dataSources.push("RocketReach");
        enrichedData.premiumSourcesUsed.push("RocketReach");
        console.log("[Enrichment] ✅ RocketReach succeeded");
      }

      if (clearbitResult) {
        enrichedData.clearbitData = clearbitResult.data;
        enrichedData.dataSources.push("Clearbit");
        enrichedData.premiumSourcesUsed.push("Clearbit");
        console.log("[Enrichment] ✅ Clearbit succeeded");
      }
    }

    // ============================================
    // Build primary contact from BEST available sources
    // Priority: Premium sources > FMCSA > Google Maps > OSM
    // ============================================
    enrichedData.primaryContact = {
      email: enrichedData.hunterioData?.email ||
             enrichedData.apolloData?.email ||
             enrichedData.zoomInfoData?.email ||
             enrichedData.rocketreachData?.email ||
             enrichedData.clearbitData?.email ||
             fmcsaResult?.data?.email ||
             googleMapsResult?.data?.email ||
             null,
      emailSource: enrichedData.hunterioData?.email ? "Hunter.io" :
                   enrichedData.apolloData?.email ? "Apollo.io" :
                   enrichedData.zoomInfoData?.email ? "ZoomInfo" :
                   enrichedData.rocketreachData?.email ? "RocketReach" :
                   enrichedData.clearbitData?.email ? "Clearbit" :
                   fmcsaResult?.data?.email ? "FMCSA MCS-150 self-reported" :
                   googleMapsResult?.data?.email ? "Google Maps" :
                   null,
      emailVerification: null,
      emailVerified: false,
      phone: enrichedData.hunterioData?.phone ||
             enrichedData.apolloData?.phone ||
             enrichedData.zoomInfoData?.phone ||
             enrichedData.rocketreachData?.phone ||
             enrichedData.clearbitData?.phone ||
             fmcsaResult?.data?.phone ||
             googleMapsResult?.data?.phone ||
             null,
      address: enrichedData.hunterioData?.address ||
               enrichedData.apolloData?.address ||
               enrichedData.zoomInfoData?.address ||
               fmcsaResult?.data?.address ||
               googleMapsResult?.data?.address ||
               osmResult?.data?.displayName ||
               null,
      website: enrichedData.hunterioData?.website ||
               enrichedData.apolloData?.website ||
               enrichedData.zoomInfoData?.website ||
               enrichedData.clearbitData?.website ||
               googleMapsResult?.data?.website ||
               null
    };

    if (enrichedData.primaryContact.email) {
      if (
        enrichedData.primaryContact.email === fmcsaResult?.data?.email &&
        fmcsaResult?.data?.emailVerification
      ) {
        enrichedData.primaryContact.emailVerification = fmcsaResult.data.emailVerification;
      } else {
        enrichedData.primaryContact.emailVerification = await verifyEmailAddress(enrichedData.primaryContact.email);
      }

      enrichedData.primaryContact.emailVerified = Boolean(
        enrichedData.primaryContact.emailVerification?.verified
      );
      enrichedData.dataQuality.emailVerified = enrichedData.primaryContact.emailVerified;
    }

    enrichedData.completeness = calculateCompletenessScore(enrichedData.primaryContact);
    enrichedData.lastEnriched = new Date().toISOString();
    enrichedData.freeServicesAvailable = getAvailableFreeServices();
    enrichedData.email = enrichedData.primaryContact.email;
    enrichedData.emailSource = enrichedData.primaryContact.emailSource;
    enrichedData.emailVerified = enrichedData.primaryContact.emailVerified;
    enrichedData.emailVerification = enrichedData.primaryContact.emailVerification;
    enrichedData.phone = enrichedData.primaryContact.phone;
    enrichedData.address = enrichedData.primaryContact.address;
    enrichedData.website = enrichedData.primaryContact.website;
    enrichedData.additionalEmails = [
      enrichedData.hunterioData?.email,
      enrichedData.apolloData?.email,
      enrichedData.zoomInfoData?.email,
      enrichedData.rocketreachData?.email,
      enrichedData.clearbitData?.email,
      fmcsaResult?.data?.email,
      googleMapsResult?.data?.email
    ].filter((email, index, emails) => email && emails.indexOf(email) === index && email !== enrichedData.email);

    console.log(`[Enrichment] Complete for ${carrierName}. Data completeness: ${enrichedData.completeness}%`);

    return enrichedData;
  } catch (err) {
    console.error("Data enrichment failed:", err);
    throw err;
  }
}

/**
 * Calculate data completeness score (0-100)
 */
function calculateCompletenessScore(contactData) {
  let score = 0;
  let maxPoints = 4;

  if (contactData.email) score++;
  if (contactData.phone) score++;
  if (contactData.address) score++;
  if (contactData.website) score++;

  return Math.round((score / maxPoints) * 100);
}

/**
 * Search for carrier by name (fuzzy search across enriched data)
 */
export async function searchCarrierByName(carrierName, limit = 10) {
  try {
    // This would connect to your database or external search service
    // For now, returns a mock result
    return {
      results: [
        {
          carrierName,
          dot: "1234567",
          mc: "7654321",
          matchScore: 0.95
        }
      ],
      total: 1
    };
  } catch (err) {
    console.error("Carrier search failed:", err);
    throw err;
  }
}

/**
 * Get new entrants alerts (recently established carriers)
 */
export async function getNewEntrantsAlerts(daysBack = 30) {
  try {
    // This would query FMCSA for new entrants within X days
    // Mock response for now
    return {
      alerts: [
        {
          carrierName: "New Trucking Ventures LLC",
          dot: "9999999",
          mc: "9999998",
          dateEstablished: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          safetyRating: "None - Under Review",
          contact: {
            email: "dispatch@newventures.com",
            phone: "(555) 999-9999",
            address: "999 New St, Atlanta, GA 30303"
          }
        }
      ],
      count: 1,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error("New entrants fetch failed:", err);
    throw err;
  }
}
