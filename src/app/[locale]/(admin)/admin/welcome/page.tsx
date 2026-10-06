import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.welcome");

export const generateMetadata = route.generateMetadata;
export default route.Page;
