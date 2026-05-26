const disabledClient = new Proxy({}, {
  get() {
    throw new Error("Supabase is disabled. Use the MyTruckingLeads backend API instead.");
  },
});

export const supabase = disabledClient;
export default disabledClient;
