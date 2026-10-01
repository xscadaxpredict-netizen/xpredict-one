/**
 * Tools API layer.
 *
 * Manages marketing materials data. Currently uses in-memory state.
 * When the backend is ready, swap for HTTP requests.
 */

import type { Brochure, Video, AdBanner } from "./types";

// ---- Seed data (will come from API later) ----------------------------------

export const SEED_BROCHURES: Brochure[] = [
  { id: "b1", title: "Xpredict Master Product Catalog 2026-27", category: "Master Catalog", fileName: "Xpredict_Master_Catalog_2026.pdf", fileSize: "8.4 MB", description: "Complete range of Reverse Osmosis plants, automatic water softeners, industrial UV units, and smart automation panels." },
  { id: "b2", title: "Industrial RO Plants (500 to 10,000 LPH)", category: "Product Brochure", fileName: "Industrial_RO_Systems_Brochure.pdf", fileSize: "4.2 MB", description: "Technical specs, flow charts, membrane schematics, and energy recovery comparisons for industrial grade RO skids." },
  { id: "b3", title: "Automatic Water Softeners & Media Filters", category: "Product Brochure", fileName: "Water_Softeners_Brochure.pdf", fileSize: "3.6 MB", description: "Features multiport valve automation, brine saturation details, and ion-exchange resin capacity ratings." },
  { id: "b4", title: "IoT Cloud-Connected Automation Panels", category: "Automation Kit", fileName: "Smart_PLC_IoT_Brochure.pdf", fileSize: "2.9 MB", description: "Remote telemetry, mobile app alerts, RS-485 Modbus integration, and cloud dashboard overview for industrial plants." },
];

export const SEED_VIDEOS: Video[] = [
  { id: "v1", title: "Xpredict Corporate & Manufacturing Tour", duration: "03:15 min", resolution: "4K Ultra HD", fileName: "Xpredict_Corporate_Tour.mp4", description: "High production quality factory tour highlighting our state-of-the-art testing facility, welding, and QC standards." },
  { id: "v2", title: "1000 LPH RO System Live Product Demonstration", duration: "04:30 min", resolution: "1080p Full HD", fileName: "RO_1000LPH_Demo.mp4", description: "Customer-facing demonstration showcasing automated flushing, quiet high-pressure pump, and touchscreen interface." },
  { id: "v3", title: "Client Success Story: Beverage & Bottling Plant", duration: "02:45 min", resolution: "1080p Full HD", fileName: "Beverage_Client_Story.mp4", description: "Case study interview explaining 40% reduction in water rejection and consistent <10 TDS output." },
];

export const SEED_ADS: AdBanner[] = [
  { id: "a1", title: "World Water Day Campaign Poster", format: "Instagram / LinkedIn Square (1080x1080)", fileName: "World_Water_Day_Creative.png", fileSize: "1.8 MB", description: "Eye-catching promotional creative highlighting sustainable water conservation and efficient RO recovery." },
  { id: "a2", title: "Authorized Dealership Opportunity Banner", format: "WhatsApp Story & Status (1080x1920)", fileName: "Dealership_Invitation_Banner.png", fileSize: "2.1 MB", description: "Recruitment flyer for regional dealers and water treatment distributors with customizable contact box." },
  { id: "a3", title: "Industrial Exhibition Roll-Up Standee", format: "High-Res Print Ready (6ft x 3ft)", fileName: "Exhibition_Standee_PrintReady.pdf", fileSize: "15.4 MB", description: "Trade show and expo roll-up standee banner layout featuring full turnkey STP, ETP, and RO solutions." },
];
