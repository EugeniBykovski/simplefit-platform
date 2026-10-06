import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.campaigns._campaign-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
