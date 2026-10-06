import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.account.suspended");

export const generateMetadata = route.generateMetadata;
export default route.Page;
