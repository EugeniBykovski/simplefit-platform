import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.events._event-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
