import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.enforcement");

export const generateMetadata = route.generateMetadata;
export default route.Page;
