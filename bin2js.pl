#!/usr/bin/perl -w

$dir = $ARGV[0];

print "var $dir = {};\n";
opendir(DIR, $dir) || die "can't opendir $dir: $!";
while ($file = readdir(DIR)) {
	next if $file =~ /^\./;
	open(FILE, "<$dir/$file") || die "can't open $file: $!";
	
	@bytes = ();
	while (read(FILE, $str, 512)) {
		push(@bytes, unpack("C*", $str));
	}
	close(FILE);
	print "${dir}['$file'] = new Uint8Array([" . join(',', @bytes) . "]);\n"
};
closedir(DIR);
