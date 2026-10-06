import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.settings.security");

export const generateMetadata = route.generateMetadata;
export default route.Page;
