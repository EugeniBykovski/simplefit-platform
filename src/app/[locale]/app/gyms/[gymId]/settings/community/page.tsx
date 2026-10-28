import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.gyms._gym-id.settings.community");

export const generateMetadata = route.generateMetadata;
export default route.Page;
